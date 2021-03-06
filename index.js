//TODO
// - socket.io middleware mode
// - socket.io res, req objects
// - Method to get array of routes

var _ = require("lodash");
var util = require("util");
module.exports = function(config, appPassed, socketPassed) {

  var app = null,
    io = null;

  if (instanceofExpress(appPassed)) {
    app = appPassed;
  }
  if (instanceofSocket(socketPassed) || instanceofSocket(appPassed)) {
    io = socketPassed;
  }

  var mode = {
    express: true,
    socket: Boolean(io),
    middleware: !Boolean(app)
  };

  if (process.env.NODE_ENV === "test") {
    this.app = app;
    this.io = io;
    this.mode = mode;
  }

  //make sure config object was passed in
  if (!_.isObject(config)) {
    console.log("Express-socket-json-route: No configuration json passed in");
    return false;
  }
  //check if app and socket exist
  if (mode.middleware) {
    var express = require("express");
    app = express.Router();
  }
  //create global vars var
  var vars = config.vars ? config.vars : {};

  if (_.isArray(config.routes)) {
    //create base uri
    var baseUri = {};
    baseUri.base = (config.baseUrl ? config.baseUrl : "");
    baseUri.base = sanitizeRoute(baseUri.base);
    baseUri.express = (config.expressUri ? config.expressUri : (config.restUri ? config.restUri : baseUri.base));
    baseUri.socket = (config.socketUri ? config.expressUri : baseUri.base);
    baseUri.express = sanitizeRoute(baseUri.express);
    baseUri.socket = sanitizeRoute(baseUri.socket);

    var routeList = {
      express: [],
      socket: []
    };

    var routesKeys = Object.keys(config.routes);
    _.each(config.routes, function(route) {
      var type = route.type.toLowerCase();
      //create base uri, it should not start with a "/"
      var expressUri = route.expressUri ? route.expressUri : (route.restUri ? route.restUri : route.uri);
      expressUri = sanitizeRoute(expressUri);

      // append base url to the expressUri
      expressUri = (baseUri.express ? "/" + baseUri.express : "") + "/" + expressUri;

      if (mode.express) {
        if (route.middleware) {
          app[type](expressUri, route.middleware, function(req, res) {
            req.vars = vars;
            route.handler(req, res);
          });
        } else {
          app[type](expressUri, route.handler);
        }
      }

      routeList.express.push(expressUri);

      if (mode.socket) {
        //socketUri: baseuri/ + uri/ + route type
        var socketUri = sanitizeRoute(route.socketUri ? route.socketUri : route.uri + (type !== "all" ? "/" + type : ""));
        socketUri = (baseUri.socket ? baseUri.socket + "/" : "") + socketUri;

        io.on("connection", function(socket) {
          routeList.socket.indexOf(socketUri) < 0? routeList.socket.push(socketUri):null;

          socket.on(socketUri, function(data) {
            route.handler({
              socket: socket,
              routeType: "socket",
              socketRoute: true,
              expressRoute: false,
              baseUrl: socketUri,
              body: data,
              originalUrl: socketUri
            }, {
              send: function(data) {
                socketSend(socket, socketUri, data);
              },
              json: function(data) {
                data.contentType = "JSON";
                socketSend(socket, socketUri, data);
              },
              render: function(data) {
                socketSend(socket, socketUri, data);
              },
              end: function() {},
              sendFile: function() {
                unsupportedMethod("sendFile");
                socketSend(socket, socketUri, {});
              },
              redirect: function() {
                unsupportedMethod("redirect");
                socketSend(socket, socketUri, {});
              }
            });
          });
          //create route to view current routes
          if (routeList.socket.length === routesKeys.length) {
            socket.on((config.routesListRoute ? config.routesListRoute : "routes"), function() {
              socketSend(socket, "routes", routeList);
            });
          }
        });
      }
    });
    app.get("/" + (config.routesListRoute ? sanitizeRoute(config.routesListRoute) : "routes"), function(req, res) {
      res.json(routeList);
    });
  } else {
    console.log("Express-socket-json-route: No routes were passed in");
    return false;
  }


  if (mode.middleware) {
    return app;
  }
  return true;
};

var instanceofExpress = function(app) {
  //check for var/ functions that express apps/routers should have
  return Boolean(app) && Boolean(app.get) && Boolean(app.post) && Boolean(app.put) && Boolean(app.route) && Boolean(app.all) && Boolean(app.param);
};

var instanceofSocket = function(io) {
  return Boolean(io) && Boolean(io.on) && Boolean(io.serveClient) && Boolean(io.attach);
};

var socketSend = function(socket, uri, data) {
  //console.log("sending: " + data);
  socket.emit(uri, data);
};

var unsupportedMethod = function(method) {
  console.log("Express-socket-json-route: Method \"" + method + "\"is not supported");
};

var sanitizeRoute = function(route) {
  if (route && route[0] && route[0] === "/"){
    return route.substr(1);
  }
  return route;
};
