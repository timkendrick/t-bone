define(
	[
		"module",
		"underscore",
		"jquery",
		"backbone"
	],
	
	function(
		module,
		_,
		$,
		Backbone
	) {
		"use strict";
		
		var keepMetadata = module.config().metadata;
		
		var components = {};
		var css = "";
		
		var cachedComponentModelJSON = null;
		
		var booleanAttributes = [
			"async",
			"autofocus",
			"autoplay",
			"checked",
			"controls",
			"default",
			"defer",
			"disabled",
			"formnovalidate",
			"hidden",
			"ismap",
			"loop",
			"multiple",
			"muted",
			"novalidate",
			"open",
			"readonly",
			"required",
			"reversed",
			"scoped",
			"seamless",
			"selected",
			"truespeed",
			"typemustmatch"
		];
		
		var unsafeAttributes = booleanAttributes.concat([
			"href",
			"src"
		]);
		
		var Component = Backbone.View.extend({
			
			template: "<div></div>",
			
			parent: null,
			active: false,
			
			elements: null,
			subviews: null,
			repeaters: null,
			
			_rendered: false,
			_currentModel: null,
			
			_bindings: null,
			_bindingListeners: null,
			_generators: null,
			
			_cssClasses: null,
			_dataBindings: null,
			_attributeBindings: null,
			_classBindings: null,
			_styleBindings: null,
			_repeaterBindings: null,
			_subviewBindings: null,
			
			render: function() {
				// Retain a reference to the current scope for use in nested functions
				var self = this;
				
				// Ensure that the component's model extends the Component.Model base class
				if (this.model && !(this.model instanceof Component.Model)) { throw new Error("Component model must extend the Component.Model class"); }
				
				// If we're re-rendering the component, it could have been activated and added to the DOM
				// Seeing as we'll need to deactivate the component and remove the old element during the rendering process, we'll need to keep track of its former state
				var active = this.active;
				var added = (this.$el && (this.$el.parent().length > 0));
				
				// If the element has been added to the DOM, we'll need to remember where in the DOM to re-insert it
				var $parent = (added ? this.$el.parent() : null);
				var $nextSibling = (added ? this.$el.next() : null);
				
				// If the component has been rendered already, we'll need to reset its state using the `unload()` method (this will also deactivate it if necessary)
				if (this._rendered) { this.unload(); }
				
				// Use the currently assigned model for all binding evaluations until it is next rendered
				this._currentModel = this.model;
				
				// Parse the `generators` hash to create the component's generated fields
				this._generators = this._createGenerators(this.generators);
				
				// Create an empty array to store any binding listeners
				this._bindings = [];
				this._bindingListeners = {};
				
				// Create the content element, and initialise any bindings etc.
				var contentElement = _initElement();
				
				// Now that the content element has been fully initialised, set it as the component element
				self.setElement(contentElement);
				
				// Add any additional CSS classes found in the model's `style` field
				self._updateComponentStyle(self._currentModel && self._currentModel.get("style"));
				
				// If we're re-rendering the component, and its previous element had been added to the DOM, reinsert the new component element in the same place 
				if (contentElement && added) {
					if ($nextSibling.length > 0) { this.$el.insertBefore($nextSibling); } else { $parent.append(this.$el); }
				}
				
				// If we're re-rendering the component, and it was previously activated (and hence deactivated during the rendering process), re-activate it
				if (active) {
					this.activate();
					this.updateSize();
				}
				
				// Add model listeners for bindings, etc.
				if (this._currentModel) { this.delegateModel(this._currentModel); }
				
				// Set an internal flag that indicates that this component has now been rendered
				this._rendered = true;
				
				// Return the component instance to allow method chaining
				return this;
				
				
				function _initElement() {
					
					// Get the render context by combining generated field values with the output of the model's `toJSON()` method 
					var context = self.getRenderContext();
					
					// Create the DOM element from the component template, passing the render context in case it's needed when pre-processing the template
					var contentElement = self.createElement(context);
					
					// Parse the DOM element for bindings
					_parseBindings(contentElement);
					
					// Initialise hashes/arrays for named elements/subviews/repeaters
					self.elements = (contentElement ? self._getNamedElements(contentElement) : []);
					self.subviews = [];
					self.repeaters = [];
					
					// Initialise any bindings found when parsing the DOM element
					_activateBindings(context);
					
					return contentElement;
					
					
					function _parseBindings(contentElement) {
						self._repeaterBindings = (contentElement ? self._getRepeaterBindings(contentElement, keepMetadata) : []);
						self._subviewBindings = (contentElement ? self._getSubviewBindings(contentElement, keepMetadata) : []);
						self._dataBindings = (contentElement ? self._getDataBindings(contentElement, keepMetadata) : []);
						self._attributeBindings = (contentElement ? self._getAttributeBindings(contentElement, keepMetadata) : []);
						self._classBindings = (contentElement ? self._getClassBindings(contentElement, keepMetadata) : []);
						self._styleBindings = (contentElement ? self._getStyleBindings(contentElement, keepMetadata) : []);
					}
					
					function _activateBindings(context) {
						// Data and attribute bindings
						self._activateDataBindings(context);
						self._activateAttributeBindings(context);
						self._activateClassBindings(context);
						self._activateStyleBindings(context);
						
						// Subview and repeater bindings
						self._activateSubviewBindings();
						self._activateRepeaterBindings();
					}
				}
			},
			
			createElement: function(context) {
				// Override this method to use a different templating engine
				// This method can also be overridden to manipulate the DOM element before it is parsed for bindings
				
				// The template can be specified either as a string of HTML, or a function that returns a string of HTML
				var template = (_(this.template).isFunction() ? this.template() : this.template);
				
				if (!template) { return null; }
				
				// Preprocess the HTML string using the underscore templating engine
				var html = _.template(template, context);
				
				// Replace any attributes that will be mangled by the conversion to a DOM element
				html = this._sanitiseHTMLAttributes(html);
				
				// Create a DOM element from the HTML string
				var element = $(html)[0];
				
				return element;
			},
			
			getRenderContext: function() {
				
				// Get a hash of the model field values
				var context = (this._currentModel ? this._currentModel.toJSON() : {});
				
				// Add any generated field values to this hash
				_(this._generators).each(function(generator, generatorName) {
					context[generatorName] = generator.generator.call(this);
				}, this);
				
				return context;
			},
			
			activate: function() {
				
				if (this.active) { return this; }
				
				this.active = true;
				
				// Activate any subviews of this component
				_(this.subviews).each(function(item) { if (item.activate) { item.activate(); } });
				
				return this;
			},
			
			updateSize: function() {
				
				// Update the size of any subviews of this component
				_(this.subviews).each(function(item) { if (item.updateSize) { item.updateSize(); } });
				
				return this;
			},
			
			deactivate: function() {
				
				if (!this.active) { return this; }
				
				this.active = false;
				
				// Deactivate any subviews of this component
				_(this.subviews).each(function(item) { if (item.deactivate) { item.deactivate(); } });
				
				return this;
			},
			
			unload: function() {
				
				// If the component is already active, we'll need to deactivate it before unloading
				if (this.active) { this.deactivate(); }
				
				// Unload any subviews and repeater subviews that have been created automatically
				if (this.subviews) { this._removeSubviews(); }
				
				// Clear all the automatically-created binding listeners
				if (this._subviewBindings) { this._deactivateSubviewBindings(); }
				if (this._repeaterBindings) { this._deactivateRepeaterBindings(); }
				if (this._dataBindings) { this._deactivateDataBindings(); }
				if (this._attributeBindings) { this._deactivateAttributeBindings(); }
				if (this._classBindings) { this._deactivateClassBindings(); }
				if (this._styleBindings) { this._deactivateStyleBindings(); }
				
				// Clear all the automatically-created model listeners
				if (this._currentModel) { this.undelegateModel(this._currentModel); }
				
				// Reset the component state
				this._currentModel = null;
				
				this._bindings = null;
				this._bindingListeners = null;
				this._generators = null;
				
				this.elements = null;
				this.repeaters = null;
				this.subviews = null;
				
				this._cssClasses = null;
				
				this._dataBindings = null;
				this._attributeBindings = null;
				this._classBindings = null;
				this._styleBindings = null;
				this._subviewBindings = null;
				this._repeaterBindings = null;
				
				// Remove the DOM element
				this.$el.remove();
				this.setElement(null);
				
				// Set an internal flag that indicates that this component is no longer rendered
				this._rendered = false;
				
				return this;
			},
			
			remove: function() {
				// Unload the component
				this.unload();
				
				// Remove the DOM element
				Backbone.View.prototype.remove.call(this);
				
				// Clear any manually-added binding listeners
				this.unbind();
				
				return this;
			},
			
			get: function(expression) {
				return this._getFieldValue(expression);
			},
			
			bind: function(bindingExpression, handler, context) {
				var existingBinding = _(this._bindings).find(
					function(bindingListener){
						return (bindingListener.expression === bindingExpression) && (bindingListener.handler === handler) && (!context || (bindingListener.context === context));
					}
				);
				
				if (existingBinding) { return this; }
				
				context = context || this;
				
				var self = this;
				
				var bindingListener = new BindingVO(bindingExpression, handler, context);
				this._bindings.push(bindingListener);
				
				if (!(bindingExpression in this._bindingListeners)) {
					this._bindingListeners[bindingExpression] = _createBindingListener(bindingExpression);
				}
				
				this._bindingListeners[bindingExpression].childListeners.push(bindingListener);
				
				return this;
				
				
				function _createBindingListener(bindingExpression) {
					var rootField = /[^\.\[$]+/.exec(bindingExpression)[0];
					var isGeneratedField = (rootField in self._generators);
					
					if (isGeneratedField) {
						
						self.on("change:" + rootField, _handleBindingValueChanged);
						
					} else {
						
						if (self._currentModel) { self._currentModel.bind(bindingExpression, _handleBindingValueChanged); }
						
					}
					
					var bindingListener = new BindingVO(bindingExpression, _handleBindingValueChanged, null);
					
					return bindingListener;
					
					
					function _handleBindingValueChanged(value) {
						var containsCollectionListener = (bindingExpression.indexOf("[]") !== -1);
						
						if (!containsCollectionListener) {
							if (_(value).isUndefined() || (bindingExpression !== rootField)) { value = self.get(bindingExpression); }
							if (bindingListener.value === value) { return; }
							bindingListener.value = value;
						}
						_(bindingListener.childListeners).each(function(childListener) {
							childListener.handler.call(childListener.context, value);
						});
					}
				}
			},
			
			unbind: function(bindingExpression, handler, context) {
				
				var matchingBindings = _(this._bindings).filter(
					function(bindingListener) {
						return (!bindingExpression || (bindingListener.expression === bindingExpression)) && (!handler || (bindingListener.handler === handler)) && (!context || (bindingListener.context === context));
					}
				);
				
				var self = this;
				_(matchingBindings).each(_removeBindingListener);
				
				return this;
				
				
				function _removeBindingListener(binding) {
					
					var rootField = /[^\.\[$]+/.exec(binding.expression)[0];
					var isGeneratedField = (rootField in self._generators);
					
					var bindingListener = self._bindingListeners[binding.expression];
					
					if (isGeneratedField) {
						
						self.off("change:" + rootField, bindingListener.handler);
						
					} else {
						
						if (self._currentModel) { self._currentModel.unbind(bindingListener.expression, bindingListener.handler); }
						
					}
					
					self._bindings.splice(self._bindings.indexOf(bindingListener), 1);
					
					if (bindingListener.childListeners.length > 1) {
						bindingListener.childListeners.splice(_(bindingListener.childListeners).indexOf(bindingListener), 1);
					} else {
						delete self._bindingListeners[bindingListener.expression];
					}
				}
			},
			
			delegateModel: function(model) {
				model.on("change:style", this._handleModelStyleChanged, this);
				
				var self = this;
				_(this._generators).each(
					function(generator, generatorName) {
						_(generator.listeners).each(
							function(binding) {
								binding.handler = _handleGeneratorFieldChanged;
								self.bind(binding.expression, _handleGeneratorFieldChanged);
							}
						);
						
						
						function _handleGeneratorFieldChanged() {
							self.trigger("change:" + generatorName, generator.generator.call(this));
						}
					}
				);
				
				_(this._bindingListeners).each(
					function(bindingListener, bindingExpression) {
						var rootField = /[^\.\[$]+/.exec(bindingExpression)[0];
						var isGeneratedField = (rootField in this._generators);
						if (!isGeneratedField) {
							var value = model.bind(bindingExpression, bindingListener.handler);
							bindingListener.value = value;
						}
					},
					this
				);
			},
			
			undelegateModel: function(model) {
				model.off("change:style", this._handleModelStyleChanged, this);
				
				var self = this;
				_(this._generators).each(
					function(generator, generatorName) {
						_(generator.listeners).each(
							function(binding) {
								self.unbind(binding.expression, binding.handler);
								binding.handler = null;
							}
						);
					}
				);
				
				_(this._bindingListeners).each(
					function(bindingListener, bindingExpression) {
						var rootField = /[^\.\[$]+/.exec(bindingExpression)[0];
						var isGeneratedField = (rootField in this._generators);
						if (!isGeneratedField) {
							model.unbind(bindingExpression, bindingListener.handler);
							bindingListener.value = null;
						}
					},
					this
				);
			},
			
			
			_createGenerators: function(generatorsDictionary) {
				var generators = {};
				
				_(generatorsDictionary).each(
					function(generatorFunction, generatorDefinition) {
						
						var result = /^(\w+)(?: \{(.+?)\})?$/.exec(generatorDefinition);
						if (!result) { throw new Error("Invalid generator definition: " + generatorDefinition); }
						
						var generatorName = result[1];
						var generatorListenerExpressions = (result[2] && result[2].split(",")) || [];
						
						var generatorListeners = [];
						
						_(generatorListenerExpressions).each(
							function(generatorListenerExpression) {
								generatorListeners.push(new BindingVO(generatorListenerExpression));
							},
							this
						);
						
						generators[generatorName] = new GeneratorVO(generatorFunction, generatorListeners);
					},
					this
				);
				return generators;
			},
			
			_handleModelStyleChanged: function(model, value) {
				this._updateComponentStyle(value);
			},
			
			_getDataBindings: function(parentElement, keepMetadata) {
				return _getElementDataBindings(parentElement, keepMetadata);
				
				
				function _getElementDataBindings(element, keepMetadata, dataBindings) {
					dataBindings = dataBindings || [];
					
					
					// Convert inline data bindings to `data-value` attributes
					if (!element.hasAttribute("data-value")) {
						var testPattern = /\{(:?)[%@!]?(.*?)\}/;
						var testElement = element.firstChild;
						while (testElement) {
							// Look for text nodes with data bindings
							if ((testElement.nodeType === 3) && testPattern.test(testElement.nodeValue)) {
								
								// Set the `data-value` attribute
								element.setAttribute("data-value", testElement.nodeValue);
								
								// Skip any other nodes, seeing as they would be wiped anyway when the binding is updated
								break;
							}
							
							testElement = testElement.nextSibling;
						}
					}
					
					// Check for a `data-value` attribute to use for the binding expression
					if (element.hasAttribute("data-value")) {
						var attributeValue = element.getAttribute("data-value");
						
						// Search for binding values
						var bindingListeners = null;
						var bindingPattern = /\{(:?)[%@!]?(.*?)\}/g
						var result;
						while ((result = bindingPattern.exec(attributeValue))) {
							
							var bindingIgnoreFlag = result[1];
							var bindingField = result[2];
							
							bindingListeners = bindingListeners || [];
							
							if (bindingIgnoreFlag !== ":") { bindingListeners.push(new BindingVO(bindingField)); }
						}
						
						if (bindingListeners) { dataBindings.push(new DataBindingVO(element, attributeValue, bindingListeners)); }
						
						// Now that the binding has been stored, the attribute can be removed for a cleaner DOM
						if (!keepMetadata) { element.removeAttribute("data-value"); }
					}
					
					// Search the element's child nodes for potential data bindings
					var currentChild = element.firstChild;
					while (currentChild) {
						
						// Retain the next sibling element, in case the DOM changes
						var nextSibling = currentChild.nextSibling;
						
						// Search for bindings within the child element
						if (currentChild.nodeType === 1) {	
							dataBindings = _getElementDataBindings(currentChild, keepMetadata, dataBindings);
						}
						
						// Try the next child node
						currentChild = nextSibling;
					}
					
					return dataBindings;
				}
			},
			
			_activateDataBindings: function(context) {
				_(this._dataBindings).each(function(dataBinding) { this._activateDataBinding(dataBinding, context); }, this);
			},
			
			_deactivateDataBindings: function() {
				_(this._dataBindings).each(function(dataBinding) { this._deactivateDataBinding(dataBinding); }, this);
			},
			
			_activateDataBinding: function(dataBinding, context) {
				var self = this;
				
				_(dataBinding.listeners).each(
					function(binding) {
						this.bind(binding.expression, _handleDataBindingFieldUpdated);
						binding.value = this._getFieldValue(binding.expression, context);
						binding.handler = _handleDataBindingFieldUpdated;
						
						
						function _handleDataBindingFieldUpdated(value) {
							binding.value = value;
							var context = _(dataBinding.listeners).reduce(
								function(context, listener) {
									context[listener.expression] = listener.value;
									return context;
								},
								{}
							);
							self._updateDataBinding(dataBinding, context);
						}
					},
					this
				);
				
				this._updateDataBinding(dataBinding, context);
			},
			
			_deactivateDataBinding: function(dataBinding) {
				_(dataBinding.listeners).each(
					function(binding) {
						this.unbind(binding.expression, binding.handler);
						binding.handler = null;
						binding.value = null;
					},
					this
				);
			},
			
			_updateDataBinding: function(dataBinding, context) {
				context = context || null;
				$(dataBinding.element).html(this._replacePlaceholders(dataBinding.expression, context));
			},
			
			
			
			_getAttributeBindings: function(parentElement, keepMetadata) {
				
				return _getElementAttributeBindings(parentElement, keepMetadata);
				
				
				function _getElementAttributeBindings(element, keepMetadata, attributeBindings) {
					attributeBindings = attributeBindings || [];
					
					// Unfortunately we have to loop through all the element's attributes, so for performance reasons we're avoiding jQuery and lodash
					for (var i = 0; i < element.attributes.length; i++) {
						
						var attribute = element.attributes[i];
						var attributeName = attribute.name;
						var attributeValue = attribute.value;
						
						// Skip attributes that don't contain bindings
						if (attributeValue.indexOf("{") === -1) { continue; }
						
						// Skip the predefined attributes, as they have their behaviour determined later on
						switch (attributeName) {
							case "data-id":
							case "data-value":
							case "data-class":
							case "data-style":
							case "data-subview":
							case "data-source":
							case "data-template":
								continue;
						}
						
						// Sanitise the attribute name
						if (attributeName.indexOf("data-attribute-") !== 0) {
							
							// Convert the attribute name to `data-attribute-xxx` form
							element.setAttribute("data-attribute-" + attributeName, attributeValue);
							
							// Skip this attribute, as the newly-added attribute will itself be handled
							continue;
						}
						
						// Get the actual attribute name
						attributeName = attributeName.substr("data-attribute-".length);
						
						// Search for binding values
						var bindingListeners = null;
						var bindingPattern = /\{(:?)[%@!]?(.+?)\}/g;
						var result;
						while ((result = bindingPattern.exec(attributeValue))) {
							
							var bindingIgnoreFlag = result[1];
							var bindingField = result[2];
							
							bindingListeners = bindingListeners || [];
							
							if (bindingIgnoreFlag !== ":") { bindingListeners.push(new BindingVO(bindingField)); }
						}
						
						if (bindingListeners) { attributeBindings.push(new AttributeBindingVO(element, attributeName, attributeValue, bindingListeners)); }
						
						// Now that the binding has been stored, the attribute can be removed for a cleaner DOM
						if (!keepMetadata) {
							element.removeAttributeNode(attribute);
							
							// Update the current index to reflect the fact that the attribute has been removed
							i--;
						}
					}
					
					// Search the element's children for data bindings
					var currentChild = element.firstChild;
					while (currentChild) {
						var nextSibling = currentChild.nextSibling;
						if (currentChild.nodeType === 1) { _getElementAttributeBindings(currentChild, keepMetadata, attributeBindings); }
						currentChild = nextSibling;
					}
					
					return attributeBindings;
				}
			},
			
			_activateAttributeBindings: function(context) {
				_(this._attributeBindings).each(function(attributeBinding) { this._activateAttributeBinding(attributeBinding, context); }, this);
			},
			
			_deactivateAttributeBindings: function() {
				_(this._attributeBindings).each(function(attributeBinding) { this._deactivateAttributeBinding(attributeBinding); }, this);
			},
			
			_activateAttributeBinding: function(attributeBinding, context) {
				var self = this;
				
				_(attributeBinding.listeners).each(
					function(binding) {
						this.bind(binding.expression, _handleAttributeBindingFieldUpdated);
						binding.value = this._getFieldValue(binding.expression, context);
						binding.handler = _handleAttributeBindingFieldUpdated;
						
						
						function _handleAttributeBindingFieldUpdated(value) {
							binding.value = value;
							var context = _(attributeBinding.listeners).reduce(
								function(context, listener) {
									context[listener.expression] = listener.value;
									return context;
								},
								{}
							);
							self._updateAttributeBinding(attributeBinding, context);
						}
					},
					this
				);
				
				this._updateAttributeBinding(attributeBinding, context);
			},
			
			_deactivateAttributeBinding: function(attributeBinding) {
				_(attributeBinding.listeners).each(
					function(binding) {
						this.unbind(binding.expression, binding.handler);
						binding.handler = null;
						binding.value = null;
					},
					this
				);
				
				attributeBinding.listeners = null;
			},
			
			_updateAttributeBinding: function(attributeBinding, context) {
				context = context || null;
				
				var attributeName = attributeBinding.attribute;
				
				var bindingValue = this._replacePlaceholders(attributeBinding.expression, context);
				
				if (_(booleanAttributes).indexOf(attributeName) !== -1) {
					$(attributeBinding.element).prop(attributeName, bindingValue === "true");
				} else {
					$(attributeBinding.element).attr(attributeName, bindingValue);
				}
			},
			
			
			
			_getClassBindings: function(parentElement, keepMetadata) {
				var $namedElements = this._getDataElements(parentElement, "data-class");
				
				var classBindings = [];
				
				_($namedElements).each(
					function(element) {
						
						var $element = $(element);
						
						var combinedBindingExpression = $element.attr("data-class");
						
						var pattern = /(?:([_a-zA-Z0-9_\-]+):)?\{(:?)([!]?(.+?))\}/g;
						
						var validationPattern = new RegExp("^(" + pattern.source + "\\s*)*$");
						if(!validationPattern.test(combinedBindingExpression)) { throw new Error("Invalid class binding expression: \"" + combinedBindingExpression + "\""); }
						
						var result;
						while ((result = pattern.exec(combinedBindingExpression))) {
							
							var className = result[1] || null;
							var bindingIgnoreFlag = result[2];
							var fullBindingExpression = result[3];
							var bindingExpression = result[4];
							
							var bindingListener = null;
							
							if (bindingIgnoreFlag !== ":") { bindingListener = new BindingVO(bindingExpression); }
							
							classBindings.push(new ClassBindingVO(element, className, fullBindingExpression, bindingListener));
						}
						
						// Now that the binding has been stored, the attribute can be removed for a cleaner DOM
						if (!keepMetadata) { element.removeAttribute("data-class"); }
						
						return classBindings;
					}
				);
				
				return classBindings;
			},
			
			_activateClassBindings: function(context) {
				_(this._classBindings).each(function(classBinding) { this._activateClassBinding(classBinding, context); }, this);
			},
			
			_deactivateClassBindings: function() {
				_(this._classBindings).each(function(classBinding) { this._deactivateClassBinding(classBinding); }, this);
			},
			
			_activateClassBinding: function(classBinding, context) {
				var self = this;
				
				if (classBinding.listener) {
					this.bind(classBinding.listener.expression, _handleClassBindingFieldUpdated);
					classBinding.listener.value = this._getFieldValue(classBinding.listener.expression, context);
					classBinding.listener.handler = _handleClassBindingFieldUpdated;
				}
				
				this._updateClassBinding(classBinding, context);
				
				
				function _handleClassBindingFieldUpdated(value) {
					classBinding.listener.value = value;
					var context = {};
					context[classBinding.listener.expression] = classBinding.listener.value;
					self._updateClassBinding(classBinding, context);
				}
			},
			
			_deactivateClassBinding: function(classBinding) {
				if (classBinding.listener) {
					this.unbind(classBinding.listener.expression, classBinding.listener.handler);
					classBinding.listener.handler = null;
					classBinding.listener.value = null;
				}
			},
			
			_updateClassBinding: function(classBinding, context) {
				context = context || null;
				
				var bindingExpression = classBinding.expression;
				
				var inverse = (bindingExpression.charAt(0) === "!");
				if (inverse) { bindingExpression = bindingExpression.substr(1); }
				
				var bindingValue = this._getFieldValue(bindingExpression, context);
				
				if (inverse) { bindingValue = !bindingValue; }
				
				
				if (classBinding.value) { $(classBinding.element).removeClass(classBinding.value); }
				
				classBinding.value = (bindingValue ? (classBinding.className || bindingValue) : null);
				
				if (classBinding.value) { $(classBinding.element).addClass(classBinding.value); }
			},
			
			
			_getStyleBindings: function(parentElement, keepMetadata) {
				var $namedElements = this._getDataElements(parentElement, "data-style");
				
				var styleBindings = [];
				
				_($namedElements).each(
					function(element) {
						
						var $element = $(element);
						
						var combinedBindingExpression = $element.attr("data-style");
						
						var pattern = /([_a-zA-Z0-9_\-]+):\s*\{(:?)([!]?(.+?))\};?/g;
						
						var validationPattern = new RegExp("^(" + pattern.source + "\\s*)*$");
						if(!validationPattern.test(combinedBindingExpression)) { throw new Error("Invalid style binding expression: \"" + combinedBindingExpression + "\""); }
						
						var result;
						while ((result = pattern.exec(combinedBindingExpression))) {
							var styleName = result[1];
							var bindingIgnoreFlag = result[2];
							var fullBindingExpression = result[3];
							var bindingExpression = result[4];
							
							var bindingListener = null;
							
							if (bindingIgnoreFlag !== ":") { bindingListener = new BindingVO(bindingExpression); }
							
							styleBindings.push(new StyleBindingVO(element, styleName, fullBindingExpression, bindingListener));
						}
						
						// Now that the binding has been stored, the attribute can be removed for a cleaner DOM
						if (!keepMetadata) { element.removeAttribute("data-style"); }
						
						return styleBindings;
					}
				);
				
				return styleBindings;
			},
			
			_activateStyleBindings: function(context) {
				_(this._styleBindings).each(function(styleBinding) { this._activateStyleBinding(styleBinding, context); }, this);
			},
			
			_deactivateStyleBindings: function() {
				_(this._styleBindings).each(function(styleBinding) { this._deactivateStyleBinding(styleBinding); }, this);
			},
			
			_activateStyleBinding: function(styleBinding, context) {
				var self = this;
				
				if (styleBinding.listener) {
					this.bind(styleBinding.listener.expression, _handleStyleBindingFieldUpdated);
					styleBinding.listener.value = this._getFieldValue(styleBinding.listener.expression, context);
					styleBinding.listener.handler = _handleStyleBindingFieldUpdated;
				}
				
				this._updateStyleBinding(styleBinding, context);
				
				
				function _handleStyleBindingFieldUpdated(value) {
					styleBinding.listener.value = value;
					var context = {};
					context[styleBinding.listener.expression] = styleBinding.listener.value;
					self._updateStyleBinding(styleBinding, context);
				}
			},
			
			_deactivateStyleBinding: function(styleBinding) {
				if (styleBinding.listener) {
					this.unbind(styleBinding.listener.expression, styleBinding.listener.handler);
					styleBinding.listener.handler = null;
					styleBinding.listener.value = null;
				}
			},
			
			_updateStyleBinding: function(styleBinding, context) {
				context = context || null;
				
				var bindingExpression = styleBinding.expression;
				
				var inverse = (bindingExpression.charAt(0) === "!");
				if (inverse) { bindingExpression = bindingExpression.substr(1); }
				
				var bindingValue = this._getFieldValue(bindingExpression, context);
				
				$(styleBinding.element).css(styleBinding.styleName, bindingValue);
			},
			
			
			
			_getSubviewBindings: function(parentElement, keepMetadata) {
				
				var $subviewContainers = this._getDataElements(parentElement, "data-subview");
					
				return _($subviewContainers).map(
					function(element) {
						var $element = $(element);
						
						var subviewExpression = $element.attr("data-subview");
						
						var subviewExpressionMatch = /^\{(.+?)\}(?::(\w+))?$/.exec(subviewExpression);
						if (!subviewExpressionMatch) { throw new Error("Invalid subview binding specified: \"" + subviewExpression + "\""); }
						
						var subviewField = subviewExpressionMatch[1];
						var subviewIdentifier = subviewExpressionMatch[2] || subviewField;
						
						var viewClass = null;
						
						var viewClassID = $element.attr("data-template") || null;
						var viewClassTemplate = $element.html();
						$element.empty();
						
						if (viewClassID) {
							
							viewClass = Component.get(viewClassID);
							if (!viewClass) { throw new Error("Invalid subview template specified: \"" + viewClassID + "\""); }
							if (!keepMetadata) { element.removeAttribute("data-template"); }
							
						} else if (viewClassTemplate) {
							
							viewClass = Component.extend({ template: viewClassTemplate });
							
						}
						
						var bindingListener = new BindingVO(subviewField);
						
						// Now that the binding has been stored, the attribute can be removed for a cleaner DOM
						if (!keepMetadata) { element.removeAttribute("data-subview"); }
						
						return new SubviewBindingVO(element, subviewField, viewClass, subviewIdentifier, bindingListener);
					},
					this
				);
			},
			
			_activateSubviewBindings: function() {
				_(this._subviewBindings).each(function(subviewBinding) { this._activateSubviewBinding(subviewBinding); }, this);
			},
			
			_deactivateSubviewBindings: function() {
				_(this._subviewBindings).each(function(subviewBinding) { this._deactivateSubviewBinding(subviewBinding); }, this);
			},
			
			_activateSubviewBinding: function(subviewBinding) {
				
				var self = this;
				
				if (subviewBinding.listener) {
					this.bind(subviewBinding.listener.expression, _handleSubviewModelFieldChanged);
					subviewBinding.listener.handler = _handleSubviewModelFieldChanged;
				}
				
				this._updateSubviewBinding(subviewBinding);
				
				
				function _handleSubviewModelFieldChanged() {
					self._updateSubviewBinding(subviewBinding);
				}
			},
			
			_updateSubviewBinding: function(subviewBinding) {
				// If there was an old subview, remove it
				if (subviewBinding.subview) { this._removeSubview(subviewBinding); }
				
				// Get the subview model from the subview binding expression
				var subviewModel = this.get(subviewBinding.expression);
				
				// Create the new subview
				var subview = this._createSubview(subviewBinding, subviewModel);
				subviewBinding.subview = subview;
				
				// Activate the new subview if one was created successfully
				if (subviewBinding.subview) { this._addSubview(subviewBinding); }
			},
			
			_deactivateSubviewBinding: function(subviewBinding) {
				
				if (subviewBinding.listener) {
					
					this.unbind(subviewBinding.listener.expression, subviewBinding.listener.handler);
					subviewBinding.listener.handler = null;
				}
			},
			
			_createSubview: function(subviewBinding, subviewModel) {
				var viewClass = null;
				
				// If model specifies its own view class, that will override the default value
				if (subviewModel && subviewModel.has("view")) {
					
					var componentID = subviewModel.get("view");
					viewClass = Component.get(componentID);
					if (!viewClass) { throw new Error("Invalid subview template specified: \"" +  componentID + "\""); }
					
				} else if (subviewBinding.subviewClass) {
					
					viewClass = subviewBinding.subviewClass;
					
				}
				
				return (viewClass ? new viewClass({ model: subviewModel }) : null);
			},
			
			_addSubview: function(subviewBinding, elementIndex) {
				var subview = subviewBinding.subview;
				
				// Add the subview to the array of subviews
				this.subviews.push(subview);
				
				// Add the subview to the hash of subviews
				if (subviewBinding.identifier) { this.subviews[subviewBinding.identifier] = subview; }
				
				subview.parent = this;
				
				// Create the subview's view element
				subview.render();
				
				// Add the subview to the container element
				if (elementIndex === 0) {
					$(subviewBinding.container).prepend(subview.$el);
				} else if (elementIndex) {
					$(subviewBinding.container).children().eq(elementIndex - 1).after(subview.$el);
				} else {
					$(subviewBinding.container).append(subview.$el);
				}
				
				if (this.active) {
					if (subview.activate) { subview.activate(); }
					if (subview.updateSize) { subview.updateSize(); }
				}
				
				return subview;
			},
			
			_removeSubviews: function() {
				_(this._subviewBindings).each(function(subviewBinding) { if (subviewBinding.subview) { this._removeSubview(subviewBinding); } }, this);
			},
			
			_removeSubview: function(subviewBinding) {
				var subview = subviewBinding.subview;
				
				// Deactivate the subview
				if (this.active) { subview.deactivate(); }
				
				// Destroy the subview
				subview.remove();
				
				if (subview.parent === this) { subview.parent = null; }
				
				// Remove the subview from the array of subviews
				this.subviews.splice(_(this.subviews).indexOf(subview), 1);
				
				// Remove the subview from the hash of subviews
				if (subviewBinding.identifier) { this.subviews[subviewBinding.identifier] = null; }
				
				// Update the subview binding
				subviewBinding.subview = null;
				
				return subview;
			},
			
			
			
			_getRepeaterBindings: function(parentElement, keepMetadata) {
				
				var $repeaterTemplates = this._getDataElements(parentElement, "data-source");
				
				return _($repeaterTemplates).map(
					function(element) {
						var $element = $(element);
						
						var repeaterExpression = $element.attr("data-source");
						
						var repeaterExpressionMatch = /^\{(.+?)\}(?::(\w+))?$/.exec(repeaterExpression);
						if (!repeaterExpressionMatch) { throw new Error("Invalid repeater binding specified: \"" + repeaterExpression + "\""); }
						
						var repeaterField = repeaterExpressionMatch[1];
						var repeaterIdentifier = repeaterExpressionMatch[2] || repeaterField;
						
						var viewClass = null;
						
						var viewClassID = $element.attr("data-template") || null;
						var viewClassTemplate = $element.html();
						$element.empty();
						
						if (viewClassID) {
							
							viewClass = Component.get(viewClassID);
							if (!viewClass) { throw new Error("Invalid repeater template specified: \"" + viewClassID + "\""); }
							element.removeAttribute("data-template");
							
						} else if (viewClassTemplate) {
							
							viewClass = Component.extend({ template: viewClassTemplate });
							
						}
						
						var bindingListener = new BindingVO(repeaterField);
						
						// Now that the binding has been stored, the attribute can be removed for a cleaner DOM
						if (!keepMetadata) { element.removeAttribute("data-source"); }
						
						return new RepeaterBindingVO(element, repeaterField, viewClass, repeaterIdentifier, bindingListener);
					},
					this
				);
			},
			
			_activateRepeaterBindings: function() {
				_(this._repeaterBindings).each(function(repeaterBinding) { this._activateRepeaterBinding(repeaterBinding); }, this);
			},
			
			_deactivateRepeaterBindings: function() {
				_(this._repeaterBindings).each(function(repeaterBinding) { this._deactivateRepeaterBinding(repeaterBinding); }, this);
			},
			
			_activateRepeaterBinding: function(repeaterBinding) {
				var self = this;
				
				this.bind(repeaterBinding.listener.expression, _handleRepeaterBindingFieldUpdated);
				repeaterBinding.listener.handler = _handleRepeaterBindingFieldUpdated;
				
				repeaterBinding.subviewBindings.length = 0;
				this.repeaters[repeaterBinding.identifier] = [];
				
				this._updateRepeaterBinding(repeaterBinding);
				
				function _handleRepeaterBindingFieldUpdated() {
					self._updateRepeaterBinding(repeaterBinding);
				}
			},
			
			_deactivateRepeaterBinding: function(repeaterBinding) {
				this.unbind(repeaterBinding.listener.expression, repeaterBinding.listener.handler);
				repeaterBinding.listener.handler = null;
				
				this._deactivateRepeaterBindingCollection(repeaterBinding);
				
				repeaterBinding.subviewBindings.length = 0;
				delete this.repeaters[repeaterBinding.identifier];
			},
			
			_updateRepeaterBinding: function(repeaterBinding) {
				var repeaterSubviews = this.repeaters[repeaterBinding.identifier];
				for (var i = repeaterSubviews.length - 1; i >= 0; i--) { this._removeRepeaterSubview(repeaterBinding, i); }
				this._deactivateRepeaterBindingCollection(repeaterBinding);
				
				this._activateRepeaterBindingCollection(repeaterBinding);
				if (repeaterBinding.collection) { (repeaterBinding.collection instanceof Backbone.Collection ? repeaterBinding.collection : _(repeaterBinding.collection)).each(function(itemModel, index) { this._addRepeaterSubview(repeaterBinding, itemModel, index); }, this); }
			},
			
			_activateRepeaterBindingCollection: function(repeaterBinding) {
				var repeaterCollection = this.get(repeaterBinding.expression);
				
				if (repeaterCollection) {
					var self = this;
					
					if (repeaterCollection instanceof Backbone.Collection) {
						repeaterCollection.on("add", _handleRepeaterCollectionItemAdded);
						repeaterCollection.on("remove", _handleRepeaterCollectionItemRemoved);
						repeaterCollection.on("reset", _handleRepeaterCollectionReset);
					}
					
					repeaterBinding.collection = repeaterCollection;
					repeaterBinding.addListener = _handleRepeaterCollectionItemAdded;
					repeaterBinding.removeListener = _handleRepeaterCollectionItemRemoved;
					repeaterBinding.resetListener = _handleRepeaterCollectionReset;
					
				} else {
					
					repeaterBinding.collection = null;
					repeaterBinding.addListener = null;
					repeaterBinding.removeListener = null;
					repeaterBinding.resetListener = null;
					
				}
				
				
				function _handleRepeaterCollectionItemAdded(itemModel, repeaterCollection, options) {
					var index = (options && ("index" in options) ? options.index : repeaterCollection.length - 1);
					self._addRepeaterSubview(repeaterBinding, itemModel, index);
				}
				
				function _handleRepeaterCollectionItemRemoved(itemModel, repeaterCollection, options) {
					self._removeRepeaterSubview(repeaterBinding, options.index);
				}
				
				function _handleRepeaterCollectionReset(collection, options) {
					var numOldSubviews = repeaterBinding.subviewBindings.length;
					var numNewSubviews = collection.length;
					var i;
					
					// Remove the old subviews
					for (i = numOldSubviews - 1; i >= 0; i--) { self._removeRepeaterSubview(repeaterBinding, i); }
					
					// Add the new subviews
					for (i = 0; i < numNewSubviews; i++) { self._addRepeaterSubview(repeaterBinding, collection.at(i), i); }
				}
			},
			
			_deactivateRepeaterBindingCollection: function(repeaterBinding) {
				if (repeaterBinding.collection) {
					if (repeaterBinding.collection instanceof Backbone.Collection) {
						repeaterBinding.collection.off("add", repeaterBinding.addListener);
						repeaterBinding.collection.off("remove", repeaterBinding.removeListener);
						repeaterBinding.collection.off("reset", repeaterBinding.resetListener);
					}
				}
				
				repeaterBinding.collection = null;
				repeaterBinding.addListener = null;
				repeaterBinding.removeListener = null;
				repeaterBinding.resetListener = null;
				
				repeaterBinding.subviewBindings.length = 0;
				this.repeaters[repeaterBinding.identifier].length = 0;
			},
			
			_addRepeaterSubview: function(repeaterBinding, itemModel, index) {
				var subviewBinding = new SubviewBindingVO(repeaterBinding.container, repeaterBinding.expression + "[" + index + "]", repeaterBinding.subviewClass);
				
				subviewBinding.subview = this._createSubview(subviewBinding, itemModel);
				
				repeaterBinding.subviewBindings.splice(index, 0, subviewBinding);
				this.repeaters[repeaterBinding.identifier].splice(index, 0, subviewBinding.subview);
				
				// Determine the correct index at which to insert the DOM element
				// (bearing in mind that some previous items in the repeater might have no subview specified)
				var elementIndex = _(repeaterBinding.subviewBindings.slice(0, index)).filter(
					function(subviewBinding) { return !!subviewBinding.subview; }
				).length;
				
				this._addSubview(subviewBinding, elementIndex);
			},
			
			_removeRepeaterSubview: function(repeaterBinding, index) {
				var subviewBinding = repeaterBinding.subviewBindings[index];
				
				this._removeSubview(subviewBinding);
				
				repeaterBinding.subviewBindings.splice(index, 1);
				this.repeaters[repeaterBinding.identifier].splice(index, 1);
			},
			
			
			_getNamedElements: function(parentElement) {
				
				var $namedElements = this._getDataElements(parentElement, "data-id");
				
				var namedElements = [];
				
				_($namedElements).each(
					function(element) {
						
						var $element = $(element);
						
						var elementName = $element.attr("data-id");
						
						var isArray = (elementName.lastIndexOf("[]") === elementName.length - "[]".length);
						
						if (isArray) {
							elementName = elementName.substr(0, elementName.length - "[]".length);
							
							if (!namedElements[elementName]) { namedElements[elementName] = []; }
							namedElements[elementName].push(element);
							
						} else {
							
							namedElements[elementName] = element;
							
						}
					}
				);
				
				return namedElements;
			},
			
			_getDataElements: function(parentElement, dataAttribute) {
				
				var $parentElement = $(parentElement);
				var $dataElements = $parentElement.find("[" + dataAttribute + "]");
				if ($parentElement.attr(dataAttribute)) { $dataElements = $parentElement.add($dataElements); }
				
				return $dataElements;
			},
			
			_getFieldValue: function(expression, context) {
				var fieldNameComponents = expression.split(".");
				var currentFieldNameComponent;
				var currentObject = context;
				
				if (!context) {
					currentFieldNameComponent = fieldNameComponents.shift();
					var rootArrayTest = /^(.+?)(?:\[(\d+)\])?$/.exec(currentFieldNameComponent);
					var rootFieldName = rootArrayTest[1];
					var rootArrayIndex = (rootArrayTest[2] ? Number(rootArrayTest[2]) : NaN);
					currentObject = (rootFieldName in this._generators ? this._generators[rootFieldName].generator.call(this) : this.model && this.model.get(rootFieldName));
					if (!isNaN(rootArrayIndex)) { currentObject = (currentObject instanceof Backbone.Collection ? currentObject.at(rootArrayIndex) : currentObject[rootArrayIndex]); }
				}
				
				while (currentObject && (currentFieldNameComponent = fieldNameComponents.shift())) {
					var arrayTest = /^(.+?)(?:\[(\d+)\])?$/.exec(currentFieldNameComponent);
					var fieldName = arrayTest[1];
					var arrayIndex = (arrayTest[2] ? Number(arrayTest[2]) : NaN);
					currentObject = (currentObject instanceof Backbone.Model ? currentObject.get(fieldName) : currentObject[fieldName]);
					if (!isNaN(arrayIndex)) { currentObject = (currentObject instanceof Backbone.Collection ? currentObject.at(arrayIndex) : currentObject[arrayIndex]); }
				}
				
				if (_(currentObject).isUndefined()) { currentObject = null; }
				
				return currentObject;
			},
			
			_sanitiseHTMLAttributes: function(html) {
				_(unsafeAttributes).each(function(attributeName) {
					var search = new RegExp('\\s+(' + attributeName + '="[^"]*\\{.*?")', "g");
					html = html.replace(search, " data-attribute-$1");
				});
				
				return html;
			},
			
			_replacePlaceholders: function(expression, context) {
				context = context || null;
				
				// Search through any placeholders in the binding expression
				var bindingPlaceholderSearch = /\{:?([%@!]?)(.*?)\}/g;
				
				var bindingTransformFunctions = {
					"!": function (value) {
						return !value;
					},
					"@": function (value) {
						return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
					},
					"%": function(value) {
						return encodeURIComponent(value);
					}
				};
				
				var result;
				while ((result = bindingPlaceholderSearch.exec(expression))) {
					var bindingTransformIndicator = result[1];
					var bindingExpression = result[2];
					
					var bindingTransform = (bindingTransformIndicator ? bindingTransformFunctions[bindingTransformIndicator] : null);
					
					// Get the replacement value from the model's render context
					var replacementValue = this._getFieldValue(bindingExpression, context);
					
					// Wipe null and undefined data binding values
					if (replacementValue === null || (_(replacementValue).isUndefined())) { replacementValue = ""; }
					
					// Invoke the transform function if there is one specified
					if (bindingTransform) { replacementValue = bindingTransform(replacementValue); }
					
					// Ensure the replacement value is a string
					replacementValue = replacementValue.toString();
					
					// Replace the placeholder with the replacement value 
					expression = expression.substr(0, result.index) + replacementValue + expression.substr(result.index + result[0].length);
					
					// Skip over the replacement value to ensure that it's not included in the next search
					bindingPlaceholderSearch.lastIndex = bindingPlaceholderSearch.lastIndex + (replacementValue.length - result[0].length);
				}
				
				return expression;
			},
			
			_updateComponentStyle: function(cssClassString) {
				var $contentElement = this.$el;
				var cssClasses = (cssClassString ? cssClassString.split(" ") : []);
				var oldCSSClasses = this._cssClasses;
				
				this._cssClasses = cssClasses;
				
				if ($contentElement) {
					
					// Remove old CSS classes
					_(oldCSSClasses).each(function(cssClass){ $contentElement.removeClass(cssClass); });
					
					// Add new CSS classes
					_(cssClasses).each(function(cssClass) { $contentElement.addClass(cssClass); });
				}
			}
		},
		{
			Model: Backbone.Model.extend({
				
				
				_bindings: null,
				_bindingValues: null,
				
				initialize: function() {
					this._bindings = [];
					this._bindingValues = {};
				},
				
				toJSON: function() {
					
					// Prevent recursion by keeping a cache of already processed model JSON representations
					var jsonCacheAlreadyExists = !!cachedComponentModelJSON;
					if (jsonCacheAlreadyExists) {
						if (this.cid in cachedComponentModelJSON) { return cachedComponentModelJSON[this.cid]; }
					} else {
						cachedComponentModelJSON = {};
					}
					
					// Get the model's unprocessed JSON representation
					var object = Backbone.Model.prototype.toJSON.call(this);
					
					// Cache this model's JSON representation before calling toJSON() on its children, in case a circular reference is encountered
					cachedComponentModelJSON[this.cid] = object;
					
					// Replace any child models that are properties of this model with their JSON representation
					_(object).each(function(value, key, object) { if ((value instanceof Backbone.Model) || (value instanceof Backbone.Collection)) { object[key] = value.toJSON(); } });
					
					// Clear up the model JSON cache if this was the model that started it all
					if (!jsonCacheAlreadyExists) { cachedComponentModelJSON = null; }
					
					return object;
				},
				
				clone: function() {
					var values = {};
					
					_(this.attributes).each(
						function(fieldValue, fieldName) {
							if (typeof fieldValue !== "undefined") {
								values[fieldName] = ((fieldValue instanceof Backbone.Model) || (fieldValue instanceof Backbone.Collection) ? fieldValue.clone() : fieldValue);
							}
						}
					);
					
					return new (this.constructor)(values);
				},
				
				get: function(expression) {
					// If a simple field was specified, use the superclass implementation
					if (this.attributes[expression] != null) { return Backbone.Model.prototype.get.call(this, expression); }
					
					var fieldNameComponents = expression.split(".");
					var currentFieldNameComponent;
					var currentObject = this;
					
					while (currentObject && (currentFieldNameComponent = fieldNameComponents.shift())) {
						var arrayTest = /^(.+)\[(\d+)?\]$/.exec(currentFieldNameComponent);
						var arrayIndex = -1;
						if (arrayTest) {
							currentFieldNameComponent = arrayTest[1];
							if (arrayTest[2]) { arrayIndex = Number(arrayTest[2]); }
						}
						currentObject = (currentObject instanceof Backbone.Model ? (currentObject === this ? Backbone.Model.prototype.get.call(this, currentFieldNameComponent) : currentObject.get(currentFieldNameComponent)) : currentObject[currentFieldNameComponent]);
						if (arrayIndex !== -1) { currentObject = (currentObject instanceof Backbone.Collection ? currentObject.at(arrayIndex) : currentObject[arrayIndex]); }
					}
					
					if (_(currentObject).isUndefined()) { currentObject = null; }
					
					return currentObject;
				},
				
				bind: function(bindingExpression, handler, context) {
					
					var existingBinding = _(this._bindings).find(
						function(bindingListener) {
							return (bindingListener.expression === bindingExpression) && (bindingListener.handler === handler) && (!context || (bindingListener.context === context));
						}
					);
					
					if (existingBinding) { return this._bindingValues[bindingExpression]; }
					
					context = context || this;
					
					if (!(bindingExpression in this._bindingValues)) { this._bindingValues[bindingExpression] = null; }
					
					var value = this._bindingValues[bindingExpression];
					
					var bindingListener = new BindingVO(bindingExpression, handler, context);
					
					bindingListener.data = _createModelListener(this, bindingExpression);
					
					this._bindings.push(bindingListener);
					
					var self = this;
					
					return value;
					
					
					function _createModelListener(model, fieldExpression) {
						var currentFieldName = fieldExpression.substr(0, fieldExpression.indexOf(".")) || fieldExpression;
						var childFieldName = fieldExpression.substr(currentFieldName.length + ".".length);
						
						var collectionIndex = -1;
						var arrayMatch = /^(.+)\[(\d+)?\]$/.exec(currentFieldName);
						if (arrayMatch) {
							currentFieldName = arrayMatch[1];
							collectionIndex = (arrayMatch[2] ? Number(arrayMatch[2]) : -1);
						}
						
						var fieldListener = new ModelListenerVO(model, "change:" + currentFieldName, _handleCurrentValueChanged);
						fieldListener.model.on(fieldListener.event, fieldListener.handler);
						
						var currentValue = model.get(currentFieldName);
						
						if (childFieldName && (currentValue instanceof Backbone.Model)) { fieldListener.childListeners = _createChildModelListeners(currentValue, childFieldName); }
						if (arrayMatch && (currentValue instanceof Backbone.Collection)) { fieldListener.childListeners = _createChildCollectionListeners(currentValue, collectionIndex, childFieldName); }
						
						return fieldListener;
						
						
						function _handleCurrentValueChanged(model, value) {
							_deactivateChildModelListeners(fieldListener.childListeners);
							fieldListener.childListeners = null;
							
							currentValue = value;
							
							if (childFieldName && (currentValue instanceof Backbone.Model)) { fieldListener.childListeners = _createChildModelListeners(currentValue, childFieldName); }
							if ((collectionIndex !== -1) && (currentValue instanceof Backbone.Collection)) { fieldListener.childListeners = _createChildCollectionListeners(currentValue, collectionIndex, childFieldName); }
							
							_handleBindingValueChanged();
						}
					}
					
					function _createChildModelListeners(model, fieldExpression) {
						var changeListener = _createModelListener(model, fieldExpression);
						return [changeListener];
					}
					
					function _deactivateChildModelListeners(modelListeners) {
						_(modelListeners).each(
							function(modelListener) {
								_deactivateChildModelListeners(modelListener.childListeners);
								modelListener.model.off(modelListener.event, modelListener.handler);
							}
						);
					}
						
					function _createChildCollectionListeners(collection, index, fieldExpression) {
						var addListener = new ModelListenerVO(collection, "add", _handleCollectionUpdated);
						var removeListener = new ModelListenerVO(collection, "remove", _handleCollectionUpdated);
						var resetListener = new ModelListenerVO(collection, "reset", _handleCollectionUpdated);
						var childChangeListener = null;
						
						addListener.model.on(addListener.event, addListener.handler);
						removeListener.model.on(removeListener.event, removeListener.handler);
						resetListener.model.on(resetListener.event, resetListener.handler);
						
						var collectionListeners = [addListener, removeListener, resetListener];
						
						var currentCollectionItem = (index !== -1 ? collection.at(index) : null);
						
						if (currentCollectionItem) {
							childChangeListener = _createModelListener(currentCollectionItem, fieldExpression);
							collectionListeners.push(childChangeListener);
						}
						
						return collectionListeners;
						
						
						function _handleCollectionUpdated() {
							if (index !== -1) {
								var newCollectionItem = collection.at(index);
								if (newCollectionItem === currentCollectionItem) { return; }
								if (currentCollectionItem) {
									_deactivateChildModelListeners(childChangeListener.childListeners);
									childChangeListener.model.off(childChangeListener.event, childChangeListener.handler);
									collectionListeners.splice(collectionListeners.indexOf(childChangeListener), 1);
								}
								currentCollectionItem = newCollectionItem;
								if (currentCollectionItem) {
									childChangeListener = _createModelListener(currentCollectionItem, fieldExpression);
									collectionListeners.push(childChangeListener);
								}
							}
							
							_handleBindingValueChanged();
						}
					}
					
					function _handleBindingValueChanged() {
						var containsCollectionListener = (bindingExpression.indexOf("[]") !== -1);
						
						var value = null;
						
						if (!containsCollectionListener) {
							value = self.get(bindingExpression);
							if (self._bindingValues[bindingExpression] === value) { return; }
							self._bindingValues[bindingExpression] = value;
						}
						
						handler.call(context, value);
					}
				},
				
				unbind: function(bindingExpression, handler, context) {
					
					if (!bindingExpression && !handler && !context) {
						
						_(this._bindings).each(
							function(bindingListener) {
								_deactivateModelListener(bindingListener.data);
							}
						);
						
						this._bindings.length = 0;
						this._bindingValues = {};
						
						return this;
					}
					
					var matchingBindings = _(this._bindings).filter(
						function(bindingListener) {
							return (!bindingExpression || (bindingListener.expression === bindingExpression)) && (!handler || (bindingListener.handler === handler)) && (!context || (bindingListener.context === context));
						}
					);
					
					_(matchingBindings).each(
						function(bindingListener) {
							_deactivateModelListener(bindingListener.data);
							
							this._bindings.splice(_(this._bindings.indexOf(bindingListener)), 1);
							if (!_(this._bindings).find(
								function(remainingListener) {
									return remainingListener.expression === bindingListener.expression;
								})
							) { delete this._bindingValues[bindingListener.expression]; }
						},
						this
					);
					
					return this;
					
					
					function _deactivateModelListener(modelListener) {
						modelListener.model.off(modelListener.event, modelListener.handler);
						_(modelListener.childListeners).each(_deactivateModelListener);
					}
				}
				
				// TODO: Generate Component.Model defaults based on component schema
				
				// TODO: Implement Component.Model validate() method based on component schema
				
			}),
			
			Collection: Backbone.Collection.extend({
				
				clone: function() {
					var values = this.map(function(model) { return (model instanceof Backbone.Model ? model.clone() : model); });
					return new (this.constructor)(values);
				}
			}),
			
			get: function(componentID) {
				return components[componentID] || null;
			},
			
			register: function(component, componentID, componentStyle) {
				if (componentID) { components[componentID] = component; }
				
				if (componentStyle) { css += "\n\n/* " + componentID + " */\n\n" + componentStyle; }
				
				return component;
			},
			
			init: function() {
				
				_injectStyleSheet(css);
				
				
				function _injectStyleSheet(css) {
					if ((typeof window !== "undefined") && (typeof document !== "undefined") && document.createStyleSheet) {
						var stylesheet = document.createStyleSheet();
						stylesheet.cssText = css;
					}
					$("style [data-tbone=true]").remove();
					$("head").append('<style type=\"text/css\" data-tbone="true">' + css + '</style>');
				}
			}
		});
		
		return Component;
		
		
		function BindingVO(expression, handler, context, value, childListeners) {
			this.expression = expression;
			this.handler = handler || null;
			this.context = context || null;
			this.value = value;
			this.childListeners = childListeners || [];
		}
		
		function ModelListenerVO(model, event, handler, childListeners) {
			this.model = model;
			this.event = event;
			this.handler = handler || null;
			this.childListeners = childListeners || [];
		}
		
		function GeneratorVO(generator, listeners) {
			this.generator = generator;
			this.listeners = listeners || [];
		}
		
		function DataBindingVO(element, expression, listeners) {
			this.element = element;
			this.expression = expression;
			this.listeners = listeners || [];
		}
		
		function AttributeBindingVO(element, attribute, expression, listeners) {
			this.element = element;
			this.attribute = attribute;
			this.expression = expression;
			this.listeners = listeners || [];
		}
		
		function ClassBindingVO(element, className, expression, listener, value) {
			this.element = element;
			this.className = className;
			this.expression = expression;
			this.listener = listener || null;
			this.value = value || null;
		}
		
		function StyleBindingVO(element, styleName, expression, listener) {
			this.element = element;
			this.styleName = styleName;
			this.expression = expression;
			this.listener = listener || null;
		}
		
		function SubviewBindingVO(container, expression, subviewClass, identifier, listener) {
			this.container = container;
			this.expression = expression;
			this.subviewClass = subviewClass || null;
			this.identifier = identifier;
			this.listener = listener || null;
			this.subview = null;
		}
		
		function RepeaterBindingVO(container, expression, subviewClass, identifier, listener) {
			this.container = container;
			this.expression = expression;
			this.subviewClass = subviewClass;
			this.identifier = identifier;
			this.listener = listener || null;
			this.collection = null;
			this.subviewBindings = [];
			this.addListener = null;
			this.removeListener = null;
			this.resetListener = null;
		}
	}
);