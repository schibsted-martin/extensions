const path = require('path');

// Makes it possible for use to generate documentation for this package.
module.exports = {
    packages: ['roc', path.join(__dirname, 'lib', 'index.js')]
};
