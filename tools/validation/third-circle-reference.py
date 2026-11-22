"""Independent Decimal (230 digits) three-circle references; no production maths."""
import json
from decimal import Decimal, localcontext
from pathlib import Path


def pi_gauss_legendre():
    a, b, t, p = Decimal(1), 1 / Decimal(2).sqrt(), Decimal('.25'), Decimal(1)
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
        if abs(st) + abs(ct) < Decimal('1e-210'):
            return sine, cosine
    raise ArithmeticError('Taylor series did not converge')


rows = []
with localcontext() as ctx:
    ctx.prec = 230
    pi = pi_gauss_legendre()
    for constant in ['pi', 'frac-22-7']:
        c = pi if constant == 'pi' else Decimal(22) / 7
        for r1, r2 in [(1.3, 1.), (1., 1.), (.25, 2.), (0., 1.), (1., 0.), (0., 0.)]:
            for n, dt in [(1., .05), (300., .05), (1e12, .137), (float(2**53 - 1), .0001), (1e30, .137)]:
                t = Decimal.from_float(n) * Decimal.from_float(dt)
                su, cu = sin_cos(t, 2 * pi)
                sv, cv = sin_cos(c * t, 2 * pi)
                sw, cw = sin_cos(c * c * t, 2 * pi)
                major, minor = Decimal.from_float(r1) * 137, Decimal.from_float(r2) * 137
                p = [(major + minor * cv) * cu, (major + minor * cv) * su, minor * sv]
                for factor in [0., .75, 1.5]:
                    a = minor * Decimal.from_float(factor)
                    q = [p[0] - a*cw*su, p[1] + a*cw*cu, p[2] + a*sw]
                    rows.append(dict(constant=constant, n=n, dt=dt, r1=r1, r2=r2, scale=137,
                                     factor=factor, p=list(map(float, p)), q=list(map(float, q))))
Path('tests/fixtures/third-circle-reference.json').write_text(json.dumps(rows, indent=2) + '\n')
