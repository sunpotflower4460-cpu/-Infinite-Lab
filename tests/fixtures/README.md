# Test fixtures

`pi-10000.txt` — the first 10,000 decimal digits of π (`3.` + 10,000 digits), extracted from
"1 Million Digits of Pi" collected by Eve Andersson (http://www.eveandersson.com/pi/digits/1000000),
via the mirror at https://github.com/eneko/Pi/blob/master/one-million.txt.

It is an external reference, independent from this project's code, used to verify the Chudnovsky implementation.
The Machin-formula cross-check in `tests/unit/math/pi.test.ts` provides a second, algorithmic verification.
