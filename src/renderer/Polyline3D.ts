import {
  Color,
  DoubleSide,
  GLSL3,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Float32BufferAttribute,
  ShaderMaterial,
  Vector2,
} from 'three'

/**
 * Screen-space anti-aliased segments. One shared point buffer, including for mirror/antipodal
 * copies. gl_InstanceID selects consecutive point pairs; ranges change with uniforms only.
 * Unlike native WebGL lines this supports actual pixel widths on phones.
 */
export function pathGeometry(points: InstancedInterleavedBuffer): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry()
  g.setAttribute(
    'position',
    new Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, -1, 0, 1, 1, 0, 0, 1, 0], 3),
  )
  g.setAttribute('instanceStart', new InterleavedBufferAttribute(points, 3, 0))
  g.setAttribute('instanceEnd', new InterleavedBufferAttribute(points, 3, 3))
  g.instanceCount = 0
  return g
}
export class PathMaterial extends ShaderMaterial {
  readonly color = new Color()
  linewidth = 1
  constructor() {
    super({
      glslVersion: GLSL3,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        tint: { value: new Color() },
        alpha: { value: 0.55 },
        width: { value: 1 },
        resolution: { value: new Vector2(1, 1) },
        first: { value: 0 },
        last: { value: 0 },
      },
      vertexShader: `
        in vec3 instanceStart;
        in vec3 instanceEnd;
        uniform vec2 resolution;
        uniform float width;
        uniform float first;
        uniform float last;
        out float across;
        void main() {
          float i = float(gl_InstanceID);
          if (i < first || i >= last) { gl_Position=vec4(2.,2.,2.,1.); across=10.; return; }
          vec4 a=projectionMatrix*modelViewMatrix*vec4(instanceStart,1.);
          vec4 b=projectionMatrix*modelViewMatrix*vec4(instanceEnd,1.);
          if (a.w <= 0. || b.w <= 0.) { gl_Position=vec4(2.,2.,2.,1.); across=10.; return; }
          vec2 delta=(b.xy/b.w-a.xy/a.w)*resolution;
          vec2 dir=length(delta)>0.00001 ? normalize(delta) : vec2(1.,0.);
          vec2 normal=vec2(-dir.y,dir.x);
          vec4 p=mix(a,b,position.x);
          float halfWidth=width*.5+1.;
          p.xy+=normal*position.y*halfWidth*2./resolution*p.w;
          gl_Position=p;
          across=position.y*halfWidth;
        }`,
      fragmentShader: `
        uniform vec3 tint;
        uniform float alpha;
        uniform float width;
        in float across;
        out vec4 outColor;
        void main() {
          float coverage=clamp(width*.5+.5-abs(across),0.,1.);
          if(coverage==0.) discard;
          outColor=vec4(tint,alpha*coverage);
        }`,
    })
  }
  range(from: number, to: number): void {
    this.uniforms.first!.value = from
    this.uniforms.last!.value = Math.max(from, to - 1)
  }
  sync(width: number, height: number): void {
    this.uniforms.tint!.value.copy(this.color)
    this.uniforms.alpha!.value = this.opacity
    this.uniforms.width!.value = this.linewidth
    this.uniforms.resolution!.value.set(width, height)
  }
}
