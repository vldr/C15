<p align="center">
    <img src='logo.svg?raw=true' height="90px">
</p>

---

C15 is a 32-bit, 100 MHz softcore microprocessor synthesized using an FPGA. Included in this repository: the synthesiseable Verilog implementation of the *processor*, an *editor*, a *compiler* and a *programmer*. 

# Try it out
The processor is fully programmable using assembly or C through a web interface — [c15.vldr.org](https://c15.vldr.org)

# Code Structure

- `cpu`: processor code
- `compiler/`: compiler code
    - `compiler/parser`: the parser of the compiler
    - `compiler/tests`: the tests of the compiler
- `programmer/`: programmer code used to write, execute and read data from the processor.
- `editor/`
    - `editor/editor/`: editor and assembler that communicates with the programmer
    - `editor/compiler`: bundled version of the compiler that the editor uses
    - `editor/samples`: sample C programs that can be loaded into the editor
    - `editor/img`: all images used by the editor
    - `editor/vs`: files used by the editor