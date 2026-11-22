"""Independent phase references: Decimal Gauss–Legendre pi + Taylor sin/cos.

No production constants, angle reducer, coordinate swaps, or JS trigonometry.
Run from the repository root: python3 tools/validation/third-flow-reference.py
"""
import json
from decimal import Decimal, localcontext
from pathlib import Path


def pi_gauss_legendre():
    a, b, t, p = Decimal(1), 1 / Decimal(2).sqrt(), Decimal("0.25"), Decimal(1)
    for _ in range(12):
        mean = (a + b) / 2
        b = (a * b).sqrt()
        t -= p * (a - mean) ** 2
        a, p = mean, p * 2
    return (a + b) ** 2 / (4 * t)


def sin_cos(angle, tau):
    angle %= tau
    sine = st = angle
    cosine = ct = Decimal(1)
    for k in range(1, 1000):
        st *= -angle * angle / ((2 * k) * (2 * k + 1))
        ct *= -angle * angle / ((2 * k - 1) * (2 * k))
        sine += st
        cosine += ct
        if abs(st) + abs(ct) < Decimal("1e-210"):
            return sine, cosine
    raise ArithmeticError("Taylor series failed to converge")


rows = []
with localcontext() as context:
    context.prec = 230
    pi = pi_gauss_legendre()
    for constant in ["pi", "frac-22-7"]:
        c = pi if constant == "pi" else Decimal(22) / 7
        for r1, r2 in [(1.3, 1.), (1., 1.), (.25, 2.), (0., 1.), (1., 0.), (0., 0.)]:
            for n, dt in [(1., .05), (300., .05), (1e12, .137), (float(2**53 - 1), .0001), (1e30, .137)]:
                u = Decimal.from_float(n) * Decimal.from_float(dt)
                v = c * u
                major = Decimal.from_float(r1) * 137
                minor = Decimal.from_float(r2) * 137

                def torus(a, b):
                    sa, ca = sin_cos(a, 2 * pi)
                    sb, cb = sin_cos(b, 2 * pi)
                    rho = major + minor * cb
                    return [float(rho * ca), float(rho * sa), float(minor * sb)]

                rows.append(dict(
                    constant=constant, n=n, dt=dt, r1=r1, r2=r2, scale=137,
                    original=torus(u, v), derived=torus(u + pi, -v),
                    positive=torus(u + pi / 2, v), negative=torus(u - pi / 2, v),
                ))

Path("tests/fixtures/third-flow-reference.json").write_text(json.dumps(rows, indent=2) + "\n")
