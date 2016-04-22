/* global USE_DEFAULT_KOA_MIDDLEWARES HAS_KOA_MIDDLEWARES KOA_MIDDLEWARES __DEV__ ROC_PATH  */

import { readFileSync } from 'fs';
import debug from 'debug';
import http from 'http';
import https from 'https';
import koa from 'koa';
import serve from 'koa-static';
import mount from 'koa-mount';

import addTrailingSlash from 'koa-add-trailing-slashes';
import normalizePath from 'koa-normalize-path';
import lowercasePath from 'koa-lowercase-path';
import removeTrailingSlash from 'koa-remove-trailing-slashes';

import { merge, getSettings, getAbsolutePath } from 'roc';

/**
 * Creates a server instance.
 *
 * @example
 * import { createServer } from 'roc-web/app';
 *
 * const server = createServer({
 *    serve: 'static',
 *    favicon: 'static/favicon.png'
 * });
 *
 * server.start();
 *
 * @param {rocServerOptions} options - Options for the server. Will override configuration in roc.config.js.
 * @param {Function[]} beforeUserMiddlewares - Middlewares that should be added before the user middlewares.
 * @returns {rocServer} server - Roc server instance.
 */
export default function createServer(options = {}, beforeUserMiddlewares = []) {
    const logger = debug('roc:server');
    logger.log = console.info.bind(console);

    const server = koa();
    const runtimeSettings = merge(getSettings('runtime'), options);

    if (USE_DEFAULT_KOA_MIDDLEWARES) {
        const middlewares = require('./middlewares').default(runtimeSettings);
        middlewares.forEach((middleware) => server.use(middleware));
    }

    if (beforeUserMiddlewares.length) {
        beforeUserMiddlewares.forEach((middleware) => server.use(middleware));
    }

    if (HAS_KOA_MIDDLEWARES) {
        const middlewares = require(KOA_MIDDLEWARES).default(runtimeSettings);
        middlewares.forEach((middleware) => server.use(middleware));
    }

    const makeServe = (toServe = []) => {
        toServe = [].concat(toServe);

        const staticSettings = process.env.NODE_ENV === 'production' ? runtimeSettings.koa.staticServe : {};

        for (const path of toServe) {
            server.use(serve(path, {
            // We use defer as default here to no try to fetch a file
            // if we have set something on body, something that is done in
            // redirect. This because https://github.com/koajs/send/issues/51
                defer: true,
                ...staticSettings
            }));
        }
    };

    if (runtimeSettings.koa.normalize.enabled) {
        server.use(normalizePath({ defer: runtimeSettings.koa.normalize.defer }));
    }

    if (runtimeSettings.koa.lowercase.enabled) {
        server.use(lowercasePath({ defer: runtimeSettings.koa.lowercase.defer }));
    }

    if (runtimeSettings.koa.trailingSlashes.enabled === true) {
        server.use(addTrailingSlash({ defer: runtimeSettings.koa.trailingSlashes.defer }));
    } else if (runtimeSettings.koa.trailingSlashes.enabled === false) {
        server.use(removeTrailingSlash());
    }

    // Serve folders
    makeServe(runtimeSettings.serve);

    function start(port, httpsPort) {
        port = port || process.env.PORT || runtimeSettings.port;
        httpsPort = httpsPort || process.env.HTTPS_PORT || runtimeSettings.https.port;

        const app = koa();
        app.use(mount(ROC_PATH, server));

        // Start the server on HTTP
        http.createServer(app.callback()).listen(port);
        logger(`Server started on port ${port} (HTTP) and served from ${ROC_PATH}`);

        // If a HTTPS port is defined we will try to start the application with SSL/TLS
        if (httpsPort) {
            let key = getAbsolutePath(runtimeSettings.https.key);
            let cert = getAbsolutePath(runtimeSettings.https.cert);

            // Add a self-signed certificate for development purposes if non is provided.
            if (__DEV__ && !key && !cert) {
                key = require('roc-package-web-app/certificate').getKey();
                cert = require('roc-package-web-app/certificate').getCert();
            }

            if (key && cert) {
                const httpsOptions = {
                    key: readFileSync(key),
                    cert: readFileSync(cert)
                };

                https.createServer(httpsOptions, app.callback()).listen(httpsPort);
                logger(`Server started on port ${httpsPort} (HTTPS) and served from ${ROC_PATH}`);
            } else {
                logger('You have defined a HTTPS port but not given any certificate files to use…');
            }
        }

        if (process.send) {
            process.send('online');
        }
    }

    return {
        server,
        start
    };
}
