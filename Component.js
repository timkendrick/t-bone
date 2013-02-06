define(
	[
		"underscore",
		"jquery",
		"backbone"
	],
	
	function(
		_,
		$,
		Backbone
	) {
		"use strict";
		
		var cachedComponentModelJSON = null;
		var pendingStyles = "";
		
		var booleanAttributes = [
			"checked",
			"selected",
			"disabled",
			"readonly"
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
				
				// If we're re-rendering the component, it could have been activated and added to the DOM
				// Seeing as we'll need to deactivate the component and remove the old element during the rendering process, we'll need to keep track of its former state
				var active = this.active;
				var added = (this.$el && (this.$el.parent().length > 0));
				
				// If the element has been added to the DOM, we'll need to remember where in the DOM to re-insert it, and remove it from the DOM
				var $parent;
				var $nextSibling;
				if (added) {
					$parent = this.$el.parent();
					$nextSibling = this.$el.next();
					
					this.$el.remove();
				}
				
				// If the component has been rendered already, we'll need to reset its state using the `unload()` method (this will also deactivate it if necessary)
				if (this._rendered) { this.unload(); }
				
				// Use the currently assigned model for all binding evaluations until it is next rendered
				this._currentModel = this.model;
				
				// Parse the `generators` hash to create the component's generated fields
				this._generators = this._createGenerators(this.generators);
				
				// Create an empty array to store any binding listeners
				this._bindingListeners = [];
				
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
				if (this._currentModel) { this._addModelListeners(this._currentModel); }
				
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
						self._repeaterBindings = (contentElement ? self._getRepeaterBindings(contentElement) : []);
						self._subviewBindings = (contentElement ? self._getSubviewBindings(contentElement) : []);
						self._dataBindings = (contentElement ? self._getDataBindings(contentElement) : []);
						self._attributeBindings = (contentElement ? self._getAttributeBindings(contentElement) : []);
						self._classBindings = (contentElement ? self._getClassBindings(contentElement) : []);
						self._styleBindings = (contentElement ? self._getStyleBindings(contentElement) : []);
					}
					
					function _activateBindings(context) {
						// Data and attribute bindings
						self._activateDataBindings();
						self._updateDataBindings(context);
						self._activateAttributeBindings();
						self._updateAttributeBindings(context);
						self._activateClassBindings();
						self._updateClassBindings(context);
						self._activateStyleBindings();
						self._updateStyleBindings(context);
						
						// Subview and repeater bindings
						self._activateSubviewBindings();
						self._addSubviews();
						self._activateRepeaterBindings();
						self._updateRepeaterBindings();
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
				html = this._sanitiseHTMLAttributes(template);
				
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
				if (this._currentModel) { this._removeModelListeners(this._currentModel); }
				
				// Clear any manually-added binding listeners
				this.unbind();
				
				// Reset the component state
				this._currentModel = null;
				
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
				this.setElement(null);
				
				// Set an internal flag that indicates that this component is no longer rendered
				this._rendered = false;
				
				return this;
			},
			
			get: function(expression) {
				return this._getFieldValue(expression, this.getRenderContext());
			},
			
			bind: function(bindingExpression, handler, context) {
				var existingBinding = _(this._bindingListeners).find(
					function(bindingListener){
						return (bindingListener.field === bindingExpression) && (bindingListener.handler === handler) && (!context || (bindingListener.context === context));
					}
				);
				
				if (existingBinding) { return this; }
				
				context = context || this;
				
				var self = this;
				_addBindingListener(bindingExpression, handler, context);
				
				return this;
				
				
				function _addBindingListener(bindingExpression, handler, context) {
					
					var rootField = /[^\.\[$]+/.exec(bindingExpression)[0];
					var isGeneratedField = (rootField in self._generators);
					
					if (isGeneratedField) {
						
						self.on("change:" + rootField, _handleBindingValueChanged, context);
						
					} else {
						
						if (self._currentModel) { self._currentModel.bind(bindingExpression, _handleBindingValueChanged, context); }
						
					}
					
					self._bindingListeners.push(new ListenerVO(bindingExpression, handler, context, _handleBindingValueChanged));
					
					
					function _handleBindingValueChanged() {
						var handlerExpectsBindingValueAsParameter = (handler.length > 0);
						
						if (handlerExpectsBindingValueAsParameter) {
							handler.call(context, self.get(bindingExpression));
						} else {
							handler.call(context);
						}
					}
				}
			},
			
			unbind: function(bindingExpression, handler, context) {
				
				var matchingBindings = _(this._bindingListeners).filter(
					function(bindingListener) {
						return (!bindingExpression || (bindingListener.field === bindingExpression)) && (!handler || (bindingListener.handler === handler)) && (!context || (bindingListener.context === context));
					}
				);
				
				var self = this;
				_(matchingBindings).each(_removeBindingListener);
				
				return this;
				
				
				function _removeBindingListener(bindingListener) {
					
					var rootField = /[^\.\[$]+/.exec(bindingListener.field)[0];
					var isGeneratedField = (rootField in self._generators);
					
					if (isGeneratedField) {
						
						self.off("change:" + rootField, bindingListener.data, bindingListener.context);
						
					} else {
						
						if (self._currentModel) { self._currentModel.unbind(bindingListener.field, bindingListener.data, bindingListener.context); }
						
					}
					
					self._bindingListeners.splice(self._bindingListeners.indexOf(bindingListener), 1);
				}
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
								generatorListeners.push(new ListenerVO(generatorListenerExpression));
							},
							this
						);
						
						generators[generatorName] = new GeneratorVO(generatorFunction, generatorListeners);
					},
					this
				);
				return generators;
			},
			
			_addModelListeners: function(model) {
				model.on("change:style", this._handleModelStyleChanged, this);
				
				var self = this;
				_(this._generators).each(
					function(generator, generatorName) {
						_(generator.listeners).each(
							function(listener) {
								listener.handler = _handleGeneratorFieldChanged;
								self.bind(listener.field, _handleGeneratorFieldChanged);
							}
						);
						
						
						function _handleGeneratorFieldChanged() {
							self.trigger("change:" + generatorName, generator.generator.call(self));
						}
					}
				);
				
				_(this._bindingListeners).each(
					function(bindingListener) {
						var rootField = /[^\.\[$]+/.exec(bindingListener.field)[0];
						var isGeneratedField = (rootField in this._generators);
						if (!isGeneratedField) { model.bind(bindingListener.field, bindingListener.data, bindingListener.context); }
					},
					this
				);
			},
			
			_removeModelListeners: function(model) {
				model.off("change:style", this._handleModelStyleChanged, this);
				
				_(this._generators).each(
					function(generator, generatorName) {
						_(generator.listeners).each(
							function(listener) {
								self.unbind(listener.field, listener.handler);
								listener.handler = null;
							}
						);
					}
				);
				
				_(this._bindingListeners).each(
					function(bindingListener) {
						var rootField = /[^\.\[$]+/.exec(bindingListener.field)[0];
						var isGeneratedField = (rootField in this._generators);
						if (!isGeneratedField) { model.unbind(bindingListener.field, bindingListener.data, bindingListener.context); }
					},
					this
				);
			},
			
			_handleModelStyleChanged: function(model, value) {
				this._updateComponentStyle(value);
			},
			
			
			_getDataBindings: function(parentElement) {
				return _getElementDataBindings(parentElement);
				
				
				function _getElementDataBindings(element, dataBindings) {
					dataBindings = dataBindings || [];
					
					// Search the element's child nodes for potential data bindings
					var currentChild = element.firstChild;
					while (currentChild) {
						
						var nextSibling = currentChild.nextSibling;
						switch (currentChild.nodeType) {
							
							case 3: // Text node
								
								var bindingExpression = currentChild.nodeValue;
								
								// Skip text nodes that don't contain bindings
								if (bindingExpression.indexOf("{") === -1) { break; }
								
								// Search for binding values
								var bindingListeners = null;
								var bindingPattern = /\{(:?)[%!]?(.*?)\}/g;
								var result;
								while ((result = bindingPattern.exec(bindingExpression))) {
									
									var bindingIgnoreFlag = result[1];
									var bindingField = result[2];
									
									bindingListeners = bindingListeners || [];
									
									if (bindingIgnoreFlag !== ":") { bindingListeners.push(new ListenerVO(bindingField)); }
								}
								
								if (bindingListeners) { dataBindings.push(new DataBindingVO(element, bindingExpression, bindingListeners)); }
								
								break;
							
							case 1: // Element node
								
								// Search for bindings within the child element
								dataBindings = _getElementDataBindings(currentChild, dataBindings);
								
								break;
						}
						
						// Try the next child node
						currentChild = nextSibling;
					}
					
					return dataBindings;
				}
			},
			
			_activateDataBindings: function() {
				_(this._dataBindings).each(function(dataBinding) { this._activateDataBinding(dataBinding); }, this);
			},
			
			_deactivateDataBindings: function() {
				_(this._dataBindings).each(function(dataBinding) { this._deactivateDataBinding(dataBinding); }, this);
			},
			
			_updateDataBindings: function(context) {
				context = context || this.getRenderContext();
				_(this._dataBindings).each(function(dataBinding) { this._updateDataBinding(dataBinding, context); }, this);
			},
			
			_activateDataBinding: function(dataBinding) {
				var self = this;
				
				_(dataBinding.listeners).each(
					function(listener) {
						this.bind(listener.field, _handleDataBindingFieldUpdated);
						listener.handler = _handleDataBindingFieldUpdated;
					},
					this
				);
				
				
				function _handleDataBindingFieldUpdated() {
					self._updateDataBinding(dataBinding);
				}
			},
			
			_deactivateDataBinding: function(dataBinding) {
				_(dataBinding.listeners).each(
					function(listener) {
						this.unbind(listener.field, listener.handler);
						listener.handler = null;
					},
					this
				);
			},
			
			_updateDataBinding: function(dataBinding, context) {
				context = context || this.getRenderContext();
				$(dataBinding.element).html(this._replacePlaceholders(dataBinding.expression, context));
			},
			
			
			
			_getAttributeBindings: function(parentElement) {
				
				return _getElementAttributeBindings(parentElement);
				
				
				function _getElementAttributeBindings(element, attributeBindings) {
					attributeBindings = attributeBindings || [];
					
					// Unfortunately we have to loop through all the element's attributes, so for performance reasons we're avoiding jQuery and lodash
					for (var i = 0; i < element.attributes.length; i++) {
						
						var attribute = element.attributes[i];
						var attributeName = attribute.name;
						var bindingExpression = attribute.value;
						
						// Skip attributes that don't contain bindings
						if (bindingExpression.indexOf("{") === -1) { continue; }
						
						// Normalise the attribute
						switch (attributeName) {
							
							// Skip the following attributes, as they have their behaviour determined later on
							case "data-id":
							case "data-class":
							case "data-style":
							case "data-subview":
							case "data-source":
								continue;
						}
						
						_(unsafeAttributes).each(function(unsafeAttribute) {
							if (attributeName !== ("data-attribute-" + unsafeAttribute)) { return; }
							
							// Correct the attribute name
							attributeName = attributeName.substr("data-attribute-".length);
							
							// Remove the attribute, seeing as it will be applied under a different name
							element.removeAttributeNode(attribute);
							
							// Update the current index to reflect the fact that the attribute has been removed
							i--;
							
							return false;
						});
						
						// Search for binding values
						var bindingListeners = null;
						var bindingPattern = /\{(:?)[%!]?(.+?)\}/g;
						var result;
						while ((result = bindingPattern.exec(bindingExpression))) {
							
							var bindingIgnoreFlag = result[1];
							var bindingField = result[2];
							
							bindingListeners = bindingListeners || [];
							
							if (bindingIgnoreFlag !== ":") { bindingListeners.push(new ListenerVO(bindingField)); }
						}
						
						if (bindingListeners) { attributeBindings.push(new AttributeBindingVO(element, attributeName, bindingExpression, bindingListeners)); }
						
					}
					
					// Search the element's children for data bindings
					var currentChild = element.firstChild;
					while (currentChild) {
						var nextSibling = currentChild.nextSibling;
						if (currentChild.nodeType === 1) { _getElementAttributeBindings(currentChild, attributeBindings); }
						currentChild = nextSibling;
					}
					
					return attributeBindings;
				}
			},
			
			_activateAttributeBindings: function() {
				_(this._attributeBindings).each(function(attributeBinding) { this._activateAttributeBinding(attributeBinding); }, this);
			},
			
			_deactivateAttributeBindings: function() {
				_(this._attributeBindings).each(function(attributeBinding) { this._deactivateAttributeBinding(attributeBinding); }, this);
			},
			
			_updateAttributeBindings: function(context) {
				context = context || this.getRenderContext();
				_(this._attributeBindings).each(function(attributeBinding) { this._updateAttributeBinding(attributeBinding, context); }, this);
			},
			
			_activateAttributeBinding: function(attributeBinding) {
				var self = this;
				
				_(attributeBinding.listeners).each(
					function(listener) {
						this.bind(listener.field, _handleAttributeBindingFieldUpdated);
						listener.handler = _handleAttributeBindingFieldUpdated;
					},
					this
				);
				
				
				function _handleAttributeBindingFieldUpdated() {
					self._updateAttributeBinding(attributeBinding);
				}
			},
			
			_deactivateAttributeBinding: function(attributeBinding) {
				_(attributeBinding.listeners).each(
					function(listener) {
						this.unbind(listener.field, listener.handler);
						listener.handler = null;
					},
					this
				);
				
				attributeBinding.listeners = null;
			},
			
			_updateAttributeBinding: function(attributeBinding, context) {
				context = context || this.getRenderContext();
				
				var attributeName = attributeBinding.attribute;
				
				var bindingValue = this._replacePlaceholders(attributeBinding.expression, context);
				
				if (_(booleanAttributes).indexOf(attributeName) !== -1) {
					$(attributeBinding.element).prop(attributeName, bindingValue === "true");
				} else {
					$(attributeBinding.element).attr(attributeName, bindingValue);
				}
			},
			
			
			
			_getClassBindings: function(parentElement) {
				var $namedElements = this._getDataElements(parentElement, "data-class");
				
				var classBindings = [];
				
				_($namedElements).each(
					function(element) {
						
						var $element = $(element);
						
						var combinedBindingExpression = $element.attr("data-class");
						
						element.removeAttribute("data-class");
						
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
							
							if (bindingIgnoreFlag !== ":") { bindingListener = new ListenerVO(bindingExpression); }
							
							classBindings.push(new ClassBindingVO(element, className, fullBindingExpression, bindingListener));
						}
						
						return classBindings;
					}
				);
				
				return classBindings;
			},
			
			_activateClassBindings: function() {
				_(this._classBindings).each(function(classBinding) { this._activateClassBinding(classBinding); }, this);
			},
			
			_deactivateClassBindings: function() {
				_(this._classBindings).each(function(classBinding) { this._deactivateClassBinding(classBinding); }, this);
			},
			
			_updateClassBindings: function(context) {
				context = context || this.getRenderContext();
				_(this._classBindings).each(function(classBinding) { this._updateClassBinding(classBinding, context); }, this);
			},
			
			_activateClassBinding: function(classBinding) {
				var self = this;
				
				if (classBinding.listener) {
					this.bind(classBinding.listener.field, _handleClassBindingFieldUpdated);
					classBinding.listener.handler = _handleClassBindingFieldUpdated;
				}
				
				
				function _handleClassBindingFieldUpdated() {
					self._updateClassBinding(classBinding);
				}
			},
			
			_deactivateClassBinding: function(classBinding) {
				if (classBinding.listener) {
					this.unbind(classBinding.listener.field, classBinding.listener.handler);
					classBinding.listener.handler = null;
				}
			},
			
			_updateClassBinding: function(classBinding, context) {
				context = context || this.getRenderContext();
				
				var bindingExpression = classBinding.expression;
				
				var inverse = (bindingExpression.charAt(0) === "!");
				if (inverse) { bindingExpression = bindingExpression.substr(1); }
				
				var bindingValue = this._getFieldValue(bindingExpression, context);
				
				if (inverse) { bindingValue = !bindingValue; }
				
				
				if (classBinding.value) { $(classBinding.element).removeClass(classBinding.value); }
				
				classBinding.value = (bindingValue ? (classBinding.className || bindingValue) : null);
				
				if (classBinding.value) { $(classBinding.element).addClass(classBinding.value); }
			},
			
			
			_getStyleBindings: function(parentElement) {
				var $namedElements = this._getDataElements(parentElement, "data-style");
				
				var styleBindings = [];
				
				_($namedElements).each(
					function(element) {
						
						var $element = $(element);
						
						var combinedBindingExpression = $element.attr("data-style");
						
						element.removeAttribute("data-style");
						
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
							
							if (bindingIgnoreFlag !== ":") { bindingListener = new ListenerVO(bindingExpression); }
							
							styleBindings.push(new StyleBindingVO(element, styleName, fullBindingExpression, bindingListener));
						}
						
						return styleBindings;
					}
				);
				
				return styleBindings;
			},
			
			_activateStyleBindings: function() {
				_(this._styleBindings).each(function(styleBinding) { this._activateStyleBinding(styleBinding); }, this);
			},
			
			_deactivateStyleBindings: function() {
				_(this._styleBindings).each(function(styleBinding) { this._deactivateStyleBinding(styleBinding); }, this);
			},
			
			_updateStyleBindings: function(context) {
				context = context || this.getRenderContext();
				_(this._styleBindings).each(function(styleBinding) { this._updateStyleBinding(styleBinding, context); }, this);
			},
			
			_activateStyleBinding: function(styleBinding) {
				
				var self = this;
				
				if (styleBinding.listener) {
					this.bind(styleBinding.listener.field, _handleStyleBindingFieldUpdated);
					styleBinding.listener.handler = _handleStyleBindingFieldUpdated;
				}
				
				
				function _handleStyleBindingFieldUpdated() {
					self._updateStyleBinding(styleBinding);
				}
			},
			
			_deactivateStyleBinding: function(styleBinding) {
				if (styleBinding.listener) {
					this.unbind(styleBinding.listener.field, styleBinding.listener.handler);
					styleBinding.listener.handler = null;
				}
			},
			
			_updateStyleBinding: function(styleBinding, context) {
				context = context || this.getRenderContext();
				
				var bindingExpression = styleBinding.expression;
				
				var inverse = (bindingExpression.charAt(0) === "!");
				if (inverse) { bindingExpression = bindingExpression.substr(1); }
				
				var bindingValue = this._getFieldValue(bindingExpression, context);
				
				$(styleBinding.element).css(styleBinding.styleName, bindingValue);
			},
			
			
			
			_getSubviewBindings: function(parentElement) {
				
				var $subviewContainers = this._getDataElements(parentElement, "data-subview");
					
				return _($subviewContainers).map(
					function(element) {
						var $element = $(element);
						
						var subviewField = $element.attr("data-subview");
						
						element.removeAttribute("data-subview");
						
						var bindingListener = new ListenerVO(subviewField);
						
						return new SubviewBindingVO(element, subviewField, bindingListener);
					},
					this
				);
			},
			
			_activateSubviewBindings: function() {
				_(this._subviewBindings).each(function(subviewBinding) { this._activateSubviewBinding(subviewBinding); }, this);
			},
			
			_activateSubviewBinding: function(subviewBinding) {
				
				if (!subviewBinding.model) {
					subviewBinding.model = this._getFieldValue(subviewBinding.field);
				}
				
				var currentSubviewBindingModel = subviewBinding.model;
				var CurrentSubviewViewClass = (subviewBinding.model ? currentSubviewBindingModel.get("view") : null);
				var currentSubviewModel = (subviewBinding.model ? currentSubviewBindingModel.get("model") : null);
				
				// Update the subview binding
				var subview = (CurrentSubviewViewClass ? new CurrentSubviewViewClass({ model: currentSubviewModel }) : null);
				subviewBinding.subview = subview;
				
				var self = this;
				
				if (subviewBinding.listener) {
					this.bind(subviewBinding.listener.field, _handleModelFieldChanged);
					subviewBinding.listener.handler = _handleModelFieldChanged;
				}
				
				if (currentSubviewBindingModel) {
					currentSubviewBindingModel.on("change:view", _handleModelFieldChanged, this);
					currentSubviewBindingModel.on("change:model", _handleModelFieldChanged, this);
				}
				
				return subview;
				
				
				function _handleModelFieldChanged() {
					var newSubviewBindingModel = self._getFieldValue(subviewBinding.listener.field);
					var NewSubviewViewClass = (newSubviewBindingModel ? newSubviewBindingModel.get("view") : null);
					var newSubviewModel = (newSubviewBindingModel ? newSubviewBindingModel.get("model") : null);
					
					var subviewBindingModelChanged = (newSubviewBindingModel !== currentSubviewBindingModel);
					var subviewViewChanged = (NewSubviewViewClass !== CurrentSubviewViewClass);
					var subviewModelChanged = (newSubviewModel !== currentSubviewModel);
					
					if (subviewBindingModelChanged) {
						if (currentSubviewBindingModel) {
							currentSubviewBindingModel.off("change:view", _handleModelFieldChanged, self);
							currentSubviewBindingModel.off("change:model", _handleModelFieldChanged, self);
						}
						if (newSubviewBindingModel) {
							newSubviewBindingModel.on("change:view", _handleModelFieldChanged, self);
							newSubviewBindingModel.on("change:model", _handleModelFieldChanged, self);
						}
					}
					
					if (subviewViewChanged) {
						
						self._updateSubviewBindingView(subviewBinding);
						
					} else if (subviewModelChanged) {
						
						self._updateSubviewBindingModel(subviewBinding);
						
					}
					
					currentSubviewBindingModel = newSubviewBindingModel;
					CurrentSubviewViewClass = NewSubviewViewClass;
					currentSubviewModel = newSubviewModel;
				}
			},
			
			_updateSubviewBindingView: function(subviewBinding) {
				
				var oldSubview = subviewBinding.subview;
				var newSubviewBindingModel = this._getFieldValue(subviewBinding.field);
				var NewSubviewViewClass = newSubviewBindingModel && newSubviewBindingModel.get("view");
				var newSubviewModel = newSubviewBindingModel && newSubviewBindingModel.get("model");
				
				// Remove the old subview if one exists
				if (oldSubview) {
					if (this.active && oldSubview.deactivate) { oldSubview.deactivate(); }
					this._removeSubview(subviewBinding);
				}
				
				// Create the new subview
				var subview = (NewSubviewViewClass ? new NewSubviewViewClass({ model: newSubviewModel }) : null);
				subviewBinding.subview = subview;
				
				// Add the new subview if one exists
				if (subview) {
					this._addSubview(subviewBinding);
					if (this.active) {
						if (subview.activate) { subview.activate(); }
						if (subview.updateSize) { subview.updateSize(); }
					}
				}
			},
			
			_updateSubviewBindingModel: function(subviewBinding) {
				// Get the new subview model value
				var newSubviewBindingModel = this._getFieldValue(subviewBinding.field);
				var newSubviewModel = newSubviewBindingModel && newSubviewBindingModel.get("model");
				
				var oldSubview = subviewBinding.subview;
				
				// Replace the old subview's model, rather than the whole thing
				oldSubview.model = newSubviewModel;
				
				// Update the old subview of changes to its model 
				oldSubview.render();
			},
			
			_deactivateSubviewBindings: function() {
				
				_(this._subviewBindings).each(function(subviewBinding) { this._deactivateSubviewBinding(subviewBinding); }, this);
				
				this._subviewBindings = null;
			},
			
			_deactivateSubviewBinding: function(subviewBinding) {
				
				var subviewBindingModel = subviewBinding.model;
				
				subviewBinding.model = null;
				
				if (subviewBinding.listener) {
					
					if (subviewBindingModel) {
						subviewBindingModel.off("change:view", subviewBinding.listener.handler, this);
						subviewBindingModel.off("change:model", subviewBinding.listener.handler, this);
					}
					
					this.unbind(subviewBinding.listener.field, subviewBinding.listener.handler);
					subviewBinding.listener.handler = null;
				}
			},
			
			_addSubviews: function() {
				
				_(this._subviewBindings).each(function(subviewBinding) { if (subviewBinding.subview) { this._addSubview(subviewBinding); } }, this);
				
			},
			
			_addSubview: function(subviewBinding, elementIndex) {
				var subview = subviewBinding.subview;
				
				// Add the subview to the array of subviews
				this.subviews.push(subview);
				
				// Add the subview to the hash of subviews
				this.subviews[subviewBinding.field] = subview;
				
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
				
				return subview;
			},
			
			_removeSubviews: function() {
				_(this._subviewBindings).each(function(subviewBinding) { if (subviewBinding.subview) { this._removeSubview(subviewBinding); } }, this);
			},
			
			_removeSubview: function(subviewBinding) {
				var subview = subviewBinding.subview;
				
				// Remove the subview from the container element
				if(subview.el && (subview.el.parentNode === subviewBinding.container)) { subview.$el.remove(); }
				
				if (subview.parent === this) { subview.parent = null; }
				
				// Destroy the subview
				subview.unload();
				
				// Remove the subview from the array of subviews
				this.subviews.splice(_(this.subviews).indexOf(subview), 1);
				
				// Remove the subview from the hash of subviews
				this.subviews[subviewBinding.field] = null;
				
				// Update the subview binding
				subviewBinding.subview = null;
				
				return subview;
			},
			
			
			
			_getRepeaterBindings: function(parentElement) {
				
				var $repeaterTemplates = this._getDataElements(parentElement, "data-source");
				
				return _($repeaterTemplates).map(
					function(element) {
						var $element = $(element);
						
						var repeaterField = $element.attr("data-source");
						
						element.removeAttribute("data-source");
						
						var subviewTemplate = $element.html();
						
						var subviewClass = (subviewTemplate ? Component.extend({ template: subviewTemplate }) : null);
						
						$element.empty();
						
						var bindingListener = new ListenerVO(repeaterField);
						
						return new RepeaterBindingVO(element, repeaterField, subviewClass, bindingListener);
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
			
			_updateRepeaterBindings: function() {
				_(this._repeaterBindings).each(function(repeaterBinding) { this._updateRepeaterBinding(repeaterBinding); }, this);
			},
			
			_activateRepeaterBinding: function(repeaterBinding) {
				var self = this;
				
				this.bind(repeaterBinding.listener.field, _handleRepeaterBindingFieldUpdated);
				repeaterBinding.listener.handler = _handleRepeaterBindingFieldUpdated;
				
				repeaterBinding.subviewBindings.length = 0;
				this.repeaters[repeaterBinding.field] = [];
				
				
				function _handleRepeaterBindingFieldUpdated() {
					self._updateRepeaterBinding(repeaterBinding);
				}
			},
			
			_deactivateRepeaterBinding: function(repeaterBinding) {
				this.unbind(repeaterBinding.listener.field, repeaterBinding.listener.handler);
				repeaterBinding.listener.handler = null;
				
				this._deactivateRepeaterBindingCollection(repeaterBinding);
				
				repeaterBinding.subviewBindings.length = 0;
				delete this.repeaters[repeaterBinding.field];
			},
			
			_updateRepeaterBinding: function(repeaterBinding) {
				for (var i = this.repeaters[repeaterBinding.field].length - 1; i >= 0; i--) { this._removeRepeaterSubview(repeaterBinding, i); }
				this._deactivateRepeaterBindingCollection(repeaterBinding);
				
				this._activateRepeaterBindingCollection(repeaterBinding);
				if (repeaterBinding.collection) { (repeaterBinding.collection instanceof Backbone.Collection ? repeaterBinding.collection : _(repeaterBinding.collection)).each(function(itemModel, index) { this._addRepeaterSubview(repeaterBinding, itemModel, index); }, this); }
			},
			
			_activateRepeaterBindingCollection: function(repeaterBinding) {
				var repeaterCollection = this._getFieldValue(repeaterBinding.field);
				
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
					
					var context = self.getRenderContext();
					
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
				this.repeaters[repeaterBinding.field].length = 0;
			},
			
			_addRepeaterSubview: function(repeaterBinding, itemModel, index) {
				var subviewBindingModel = (itemModel instanceof Component.SubviewBinding ? itemModel : new Component.SubviewBinding({ view: repeaterBinding.subviewClass, model: itemModel }));
				var subviewBinding = new SubviewBindingVO(repeaterBinding.container, repeaterBinding.field + "[" + index + "]", null, subviewBindingModel);
				
				this._activateSubviewBinding(subviewBinding);
				this._addSubview(subviewBinding, index);
				
				if (this.active) {
					if (subviewBinding.subview.activate) { subviewBinding.subview.activate(); }
					if (subviewBinding.subview.updateSize) { subviewBinding.subview.updateSize(); }
				}
				
				repeaterBinding.subviewBindings.splice(index, 0, subviewBinding);
				this.repeaters[repeaterBinding.field].splice(index, 0, subviewBinding.subview);
			},
			
			_removeRepeaterSubview: function(repeaterBinding, index) {
				var subviewBinding = repeaterBinding.subviewBindings[index];
				
				this._deactivateSubviewBinding(subviewBinding);
				if (this.active && subviewBinding.subview.deactivate) { subviewBinding.subview.deactivate(); }
				this._removeSubview(subviewBinding);
				
				repeaterBinding.subviewBindings.splice(index, 1);
				this.repeaters[repeaterBinding.field].splice(index, 1);
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
					var search = new RegExp('(' + attributeName + '="[^"]*\\{.*?")', "g");
					html = html.replace(search, " data-attribute-$1");
				});
				
				return html;
			},
			
			_replacePlaceholders: function(expression, context) {
				context = context || this.getRenderContext();
				
				// Search through any placeholders in the binding expression
				var bindingPlaceholderSearch = /\{:?([%!]?)(.*?)\}/g;
				
				var bindingTransformFunctions = {
					"!": function (value) { return value; },
					"%": window.encodeURIComponent
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
				
				
				_bindingListeners: null,
				
				initialize: function() {
					this._bindingListeners = [];
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
				
				getFieldValue: function(fieldExpression) {
					var fieldNameComponents = fieldExpression.split(".");
					var currentFieldNameComponent;
					var currentObject = this;
					
					while (currentObject && (currentFieldNameComponent = fieldNameComponents.shift())) {
						var arrayTest = /^(.+)\[(\d+)\]$/.exec(currentFieldNameComponent);
						if (arrayTest) {
							currentFieldNameComponent = arrayTest[1];
							var arrayIndex = Number(arrayTest[2]);
							var collection = (currentObject instanceof Backbone.Model ? currentObject.get(currentFieldNameComponent) : currentObject[currentFieldNameComponent]);
							currentObject = (collection instanceof Backbone.Collection ? collection.at(arrayIndex) : collection[arrayIndex]);
						} else {
							currentObject = (currentObject instanceof Backbone.Model ? currentObject.get(currentFieldNameComponent) : currentObject[currentFieldNameComponent]);
						}
					}
					
					if (_(currentObject).isUndefined()) { currentObject = null; }
					
					return currentObject;
				},
				
				bind: function(bindingExpression, handler, context) {
					
					var existingBinding = _(this._bindingListeners).find(
						function(bindingListener) {
							return (bindingListener.field === bindingExpression) && (bindingListener.handler === handler) && (!context || (bindingListener.context === context));
						}
					);
					
					if (existingBinding) { return; }
					
					context = context || this;
					
					var bindingListener = new ListenerVO(bindingExpression, handler, context);
					
					bindingListener.data = _createModelListener(this, bindingExpression);
					
					this._bindingListeners.push(bindingListener);
					
					var self = this;
					
					
					function _createModelListener(model, fieldExpression) {
						var currentFieldName = fieldExpression.substr(0, fieldExpression.indexOf(".")) || fieldExpression;
						var childFieldName = fieldExpression.substr(currentFieldName.length + ".".length);
						
						var collectionIndex = -1;
						var arrayMatch = /^(.+)\[(\d+)\]$/.exec(currentFieldName);
						if (arrayMatch) {
							currentFieldName = arrayMatch[1];
							collectionIndex = Number(arrayMatch[2]);
						}
						
						var fieldListener = new ModelListenerVO(model, "change:" + currentFieldName, _handleCurrentValueChanged);
						fieldListener.model.on(fieldListener.event, fieldListener.handler);
						
						var currentValue = model.get(currentFieldName);
						
						if (childFieldName && (currentValue instanceof Backbone.Model)) { fieldListener.childListeners = _createChildModelListeners(currentValue, childFieldName); }
						if ((collectionIndex !== -1) && (currentValue instanceof Backbone.Collection)) { fieldListener.childListeners = _createChildCollectionListeners(currentValue, collectionIndex, childFieldName); }
						
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
						
						var currentCollectionItem = collection.at(index);
						
						if (currentCollectionItem) {
							childChangeListener = _createModelListener(currentCollectionItem, fieldExpression);
							collectionListeners.push(childChangeListener);
						}
						
						return collectionListeners;
						
						
						function _handleCollectionUpdated() {
							var newCollectionItem = collection.at(index);
							if (newCollectionItem === currentCollectionItem) { return; }
							if (currentCollectionItem) {
								_deactivateChildModelListeners(childChangeListener.childListeners);
								childChangeListener.model.off(childChangeListener.event, childChangeListener.handler);
								collectionListeners.splice(collectionListeners.indexOf(childChangeListener), 1);
							}
							currentCollectionItem = newCollectionItem;
							if (currentCollectionItem) {
								childChangeListener = _createModelListener(currentCollectionItem, fieldExpression, handler);
								collectionListeners.push(childChangeListener);
							}
							var handlerExpectsBindingValueAsParameter = (handler.length > 0);
							
							if (handlerExpectsBindingValueAsParameter) {
								handler.call(context, self.getFieldValue(bindingExpression));
							} else {
								handler.call(context);
							}
						}
					}
					
					function _handleBindingValueChanged() {
						var handlerExpectsBindingValueAsParameter = (handler.length > 0);
						
						if (handlerExpectsBindingValueAsParameter) {
							handler.call(context, self.getFieldValue(bindingExpression));
						} else {
							handler.call(context);
						}
					}
				},
				
				unbind: function(bindingExpression, handler, context) {
					
					if (!bindingExpression && !handler && !context) {
						
						_(this._bindingListeners).each(
							function(bindingListener) {
								_deactivateModelListener(bindingListener.data);
							}
						);
						
						this._bindingListeners.length = 0;
						
						return this;
					}
					
					var matchingBindings = _(this._bindingListeners).filter(
						function(bindingListener) {
							return (!bindingExpression || (bindingListener.field === bindingExpression)) && (!handler || (bindingListener.handler === handler)) && (!context || (bindingListener.context === context));
						}
					);
					
					_(matchingBindings).each(
						function(bindingListener) {
							_deactivateModelListener(bindingListener.data);
							
							this._bindingListeners.splice(_(this._bindingListeners.indexOf(bindingListener)), 1);
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
				
				toJSON: function() {
					return this.map(function(model) { return model.toJSON(); });
				},
				
				clone: function() {
					var values = this.map(function(model) { return (model instanceof Backbone.Model ? model.clone() : model); });
					return new (this.constructor)(values);
				}
			}),
			
			SubviewBinding: Backbone.Model.extend({
				
				defaults: {
					view: null,
					model: null
				},
				
				toJSON: function() {
					var model = this.get("model");
					return (model ? model.toJSON() : {});
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
				}
			}),
			
			registerStyle: function(componentStyle) {
				
				if (pendingStyles) {
					
					pendingStyles += "\n\n" + componentStyle;
					
				} else {
					
					pendingStyles = componentStyle || "";
					if (!pendingStyles) { return; }
					
					setTimeout(
						function() {
							_addStyleSheet(pendingStyles);
							pendingStyles = "";
						},
						0
					);
				}
				
				
				function _addStyleSheet(css) {
					if (document.createStyleSheet) {
						var stylesheet = document.createStyleSheet();
						stylesheet.cssText = css;
					} else {
						$("head").append("<style type=\"text/css\">" + css + "</style>");
					}
				}
			}
		});
		
		return Component;
		
		
		function ListenerVO(field, handler, context, data) {
			this.field = field;
			this.handler = handler || null;
			this.context = context || null;
			this.data = data || null;
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
		
		function SubviewBindingVO(container, field, listener, model) {
			this.container = container;
			this.field = field;
			this.listener = listener || null;
			this.model = model || null;
			this.subview = null;
		}
		
		function RepeaterBindingVO(container, field, subviewClass, listener) {
			this.container = container;
			this.field = field;
			this.subviewClass = subviewClass;
			this.listener = listener || null;
			this.collection = null;
			this.subviewBindings = [];
			this.addListener = null;
			this.removeListener = null;
			this.resetListener = null;
		}
	}
);