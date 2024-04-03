struct Uniforms {
  mvpMatrix : mat4x4<f32>,
}
@binding(0) @group(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragColor : vec4<f32>,
}

@vertex
fn main(
  @location(0) position: vec3<f32>,
  @location(1) color: vec4<f32>
) -> VertexOutput {
  var output : VertexOutput;
  output.Position = uniforms.mvpMatrix * vec4<f32>(position, 1);
  output.fragColor = color;
  
  return output;
}
