# C15 Compiler

A C-style compiler targeting the C15 processor.

## Features
- Single-pass compilation
- Strict type-checking
- Support for *struct*, *array* and 32-bit primitive types &mdash; *uint*, *int*, and *float*

## Components
The programming language is comprised of two components &mdash; the compiler and the interpreter.

### Compiler
The compiler is responsible for converting the C-style syntax to machine code.

### Interpreter
The interpreter is responsible for executing C15 machine code that is emitted by the compiler. This is used to test the compiler without having to communicate with the processor.

## Building
To build the project:

1. Run `npm i`
2. Run `npm run build`

After the build process completes, the `dist/` directory will contain all the compiled JavaScript files and the `build/` directory will contain the bundled compiler.

## Testing

To run the tests for the project:

1. Run `npm i`
2. Run `npm test`