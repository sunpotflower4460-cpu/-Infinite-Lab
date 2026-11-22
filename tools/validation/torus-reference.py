"""Independent 190-digit Decimal references. Standard library only; no JS reducer/detmath.
Run from repository root: python3 tools/validation/torus-reference.py
Float inputs are interpreted as their exact IEEE-754 rational values.
"""
import json
from decimal import Decimal, localcontext
from pathlib import Path

PI = Decimal(
    "3.141592653589793238462643383279502884197169399375105820974944592307816406286208998628"
    "034825342117067982148086513282306647093844609550582231725359408128481117450284102701"
    "93852110555964462294895493038196"
)


def sin_cos(a):
    sine = st = a
    cosine = ct = Decimal(1)
    k = 1
    while abs(st) + abs(ct) > Decimal("1e-180"):
        st *= -a * a / ((2 * k) * (2 * k + 1))
        ct *= -a * a / ((2 * k - 1) * (2 * k))
        sine += st
        cosine += ct
        k += 1
    return sine, cosine


rows = []
with localcontext() as context:
    context.prec = 190
    for constant in ["pi", "frac-22-7"]:
        C = PI if constant == "pi" else Decimal(22) / 7
        for n, dt in [(1., .05), (1e6, .137), (1e12, .05), (float(2**53 - 1), .0001), (1e30, .137)]:
            a = Decimal.from_float(n) * Decimal.from_float(dt)
            b = a * C
            a %= 2 * PI
            b %= 2 * PI
            s1, c1 = sin_cos(a)
            s2, c2 = sin_cos(b)
            R, r, scale = Decimal.from_float(1.3), Decimal.from_float(.75), Decimal(137)
            rho = R + r * c2
            rows.append(dict(
                constant=constant, n=n, dt=dt, r1=1.3, r2=.75, scale=137,
                theta1=float(a), theta2=float(b),
                x=float(scale * rho * c1), y=float(scale * rho * s1), z=float(scale * r * s2),
            ))
Path("tests/fixtures/torus-reference.json").write_text(json.dumps(rows, indent=2) + "\n")
