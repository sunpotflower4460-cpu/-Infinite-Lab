# Test fixtures

`pi-10000.txt` — the first 10,000 decimal digits of π (`3.` + 10,000 digits), extracted from
"1 Million Digits of Pi" collected by Eve Andersson (http://www.eveandersson.com/pi/digits/1000000),
via the mirror at https://github.com/eneko/Pi/blob/master/one-million.txt.

It is an external reference, independent from this project's code, used to verify the Chudnovsky implementation.
The Machin-formula cross-check in `tests/unit/math/pi.test.ts` provides a second, algorithmic verification.

`e-10000.txt`, `sqrt2-10000.txt`, `phi-10000.txt` — first 10,000 decimal digits (truncated) of e, √2 and φ,
generated with mpmath 1.4.1 (independent arbitrary-precision library, `mp.dps = 10050`) and cross-checked at
generation time against Python integer arithmetic (`math.isqrt` for √2 and φ, an integer Σ1/k! series for e).
The same mpmath run reproduced `pi-10000.txt` exactly.
