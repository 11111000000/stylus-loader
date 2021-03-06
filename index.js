var loaderUtils = require('loader-utils');
var stylus = require('stylus');
var path = require('path');
var fs = require('fs');

var CachedPathEvaluator = require('./lib/evaluator');
var PathCache = require('./lib/pathcache');
var utils = require('stylus').utils;

module.exports = function(source) {
  var self = this;
  this.cacheable && this.cacheable();
  var done = this.async();
  var options = loaderUtils.parseQuery(this.query);
  options.filename = options.filename || this.resourcePath;
  options.Evaluator = CachedPathEvaluator;

  var stylusOptions = this.options.stylus || {};
  options.use = options.use || stylusOptions.use || [];
  options.import = options.import || stylusOptions.import || [];

  var styl = stylus(source, options);
  var paths = [path.dirname(options.filename)];

  function needsArray(value) {
    return (Array.isArray(value)) ? value : [value];
  }

  if (options.paths && !Array.isArray(options.paths)) {
    paths = paths.concat(options.paths);
    options.paths = [options.paths];
  }

  var manualImports = [];
  Object.keys(options).forEach(function(key) {
    var value = options[key];
    if (key === 'use') {
      needsArray(value).forEach(function(plugin) {
        if (typeof plugin === 'function') {
          styl.use(plugin);
        } else {
          throw new Error('Plugin should be a function');
        }
      });
    } else if (key === 'define') {
      for (var defineName in value) {
        styl.define(defineName, value[defineName]);
      }
    } else if (key === 'import') {
      needsArray(value).forEach(function(stylusModule) {
        styl.import(stylusModule);
        manualImports.push(stylusModule);
      });
    } else {
      styl.set(key, value);

      if (key === 'resolve url' && value) {
        styl.define('url', stylus.resolver());
      }
    }
  });

  manualImports = manualImports.map(function (it) { return utils.lookup(it, options.paths, '', true); });

  var boundResolvers = PathCache.resolvers(options, this.resolve);

  var cache = manualImports.concat(options.filename).reduce(function(carry, filename) {
    return carry
      .then(function(lastCache) {
        return PathCache.createFromFile(boundResolvers, lastCache.contexts, filename);
      });
  }, PathCache.create());

  cache
    .then(function(importPathCache) {
      // CachedPathEvaluator will use this PathCache to find its dependencies.
      options.cache = importPathCache;
      manualImports.concat(importPathCache.allDeps()).forEach(self.addDependency);
      styl.render(function(err, css) {
        if (err) done(err);
        else done(null, css);
      });
    })
    .catch(done);
}
