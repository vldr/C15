const path = require('path');

module.exports = {
    entry: "./dist/source/Compiler.js",
    mode: "production",
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: 'compiler.js',
        library: {
            name: 'Compiler',
            type: 'var',
            export: 'default',
        },
    },
};