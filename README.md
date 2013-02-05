T-Bone component framework
==========================

Beefing up Backbone views with data bindings, subviews, repeaters and more


## The motivation behind T-Bone

Backbone views are great in their bare-bones simplicity, but by themselves they don't really... _do_ much.

This means that you find yourself typing out the same code again and again, or (worse) taking shortcuts to get the job done quickly.

T-Bone was created to cut out the boring repetitive parts so you can spend your time doing the kind of coding you actually enjoy. 


## What problems does this framework solve?

1. Encourages simple, portable, modular code
2. Reduces boilerplate
3. Speeds up development like nothing else


### How does it achieve these goals?

* The project is split into reusable, modular components wherever possible
* These components use HTML templates to dictate their appearance, allowing for rapid templating and development
* Enhanced syntax in HTML templates automatically hooks up data bindings and subviews, keeping logic outside the HTML
* Bindings and subviews are auto-managed behind the scenes, cutting out boilerplate and producing more robust code
* All the components are Backbone.js views, ensuring an easy transition for anybody familiar with the Backbone framework


## Prerequisites

* Backbone.js
* Require.js (or alternative AMD loader)


## Installation

To import T-Bone into another repository's `app/lib` directory, run the following commands:

``` bash
	# Register the GitHub repository as a submodule
	git submodule add git@github.com:timkendrick/t-bone.git app/lib/t-bone
	
	# Initialise the submodule contents
	git submodule update --init
```

T-Bone is packaged as an AMD module, so to use it in another module make sure to import it using your AMD loader:

```javascript
	define(["lib/t-bone/Component"], function(Component) {
		// Your code here
	});
```


## Example project

The example project at https://github.com/timkendrick/t-bone-template provides a simple template for new T-Bone projects


## Getting started

Full documentation can be found in [the wiki section](https://github.com/timkendrick/t-bone/wiki).