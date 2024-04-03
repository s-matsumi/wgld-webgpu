import { mat4 } from "https://wgpu-matrix.org/dist/2.x/wgpu-matrix.module.js";

onload = async function () {
  // canvasエレメントを取得
  const canvas = document.getElementById("canvas");
  canvas.width = 300;
  canvas.height = 300;

  // webgpuコンテキストの取得
  const context = canvas.getContext("webgpu");

  // deviceの取得
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();

  // シェーダーの取得
  const vs = await (await fetch("vertex.wgsl")).text();
  const fs = await (await fetch("fragment.wgsl")).text();

  // コンテクストの設定
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: device,
    format: presentationFormat,
    alphaMode: "opaque",
  });

  // 頂点情報の構成
  const vertexSize = 4 * 7; // 1頂点のバイトサイズ
  const positionOffset = 4 * 0; // 座標データのオフセット
  const colorOffset = 4 * 3; // 色データのオフセット

  // トーラスの生成
  var [vertexArray, indexArray] = torus(32, 32, 1.0, 2.0);

  // 頂点バッファを作成
  const verticesBuffer = device.createBuffer({
    size: vertexArray.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(verticesBuffer.getMappedRange()).set(vertexArray);
  verticesBuffer.unmap();

  // インデックスバッファを作成
  const indexesBuffer = device.createBuffer({
    size: indexArray.byteLength,
    usage: GPUBufferUsage.INDEX,
    mappedAtCreation: true,
  });
  new Uint16Array(indexesBuffer.getMappedRange()).set(indexArray);
  indexesBuffer.unmap();

  // レンダーパイプラインを作成
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: device.createShaderModule({
        code: vs,
      }),
      entryPoint: "main",
      buffers: [
        {
          // 配列の要素間の距離をバイト単位で指定
          arrayStride: vertexSize,

          // 頂点バッファの属性を指定
          attributes: [
            {
              // 座標
              shaderLocation: 0, // @location(0) in vertex shader
              offset: positionOffset,
              format: "float32x3",
            },
            {
              // 色
              shaderLocation: 1, // @location(1) in vertex shader
              offset: colorOffset,
              format: "float32x4",
            },
          ],
        },
      ],
    },
    fragment: {
      module: device.createShaderModule({
        code: fs,
      }),
      entryPoint: "main",
      targets: [
        {
          // @location(0) in fragment shader
          format: presentationFormat,
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
      // カリングモード
      cullMode: "back",
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth24plus",
    },
  });

  // 深度テクスチャを作成
  const depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  // ユニフォームバッファを作成
  const uniformBufferSize = 4 * 16; // 4 byte * 4x4 matrix
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // バインドグループを作成
  const uniformBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0, // @binding(0) in shader
        resource: {
          buffer: uniformBuffer,
        },
      },
    ],
  });

  const mMatrix = mat4.identity();
  const vMatrix = mat4.identity();
  const pMatrix = mat4.identity();
  const tmpMatrix = mat4.identity();
  const mvpMatrix = mat4.identity();

  // ビュー座標変換行列
  mat4.lookAt([0.0, 0.0, 20.0], [0, 0, 0], [0, 1, 0], vMatrix);

  // プロジェクション座標変換行列
  mat4.perspective(45, canvas.width / canvas.height, 0.1, 100, pMatrix);

  // 各行列を掛け合わせ座標変換行列を完成させる
  mat4.multiply(pMatrix, vMatrix, tmpMatrix);

  // カウンタの宣言
  var count = 0;

  // 恒常ループ
  const frame = function () {
    // GPUにコマンドを送信するためのエンコーダーを作成
    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();
    const renderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, // 背景色を設定
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    };
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);

    // カウンタをインクリメントする
    count++;

    // カウンタを元にラジアンを算出
    var rad = ((count % 360) * Math.PI) / 180;

    // モデル座標変換行列の生成
    mat4.identity(mMatrix);
    mat4.rotate(mMatrix, [0, 1, 1], rad, mMatrix);
    mat4.multiply(tmpMatrix, mMatrix, mvpMatrix);
    device.queue.writeBuffer(
      uniformBuffer,
      0,
      mvpMatrix.buffer,
      mvpMatrix.byteOffset,
      mvpMatrix.byteLength
    );

    // 頂点バッファをセット
    passEncoder.setVertexBuffer(0, verticesBuffer);

    // インデックスバッファをセット
    passEncoder.setIndexBuffer(indexesBuffer, "uint16");

    // バインドグループをセット
    passEncoder.setBindGroup(0, uniformBindGroup);

    // 描画
    passEncoder.drawIndexed(indexArray.length);

    // レンダーパスコマンドシーケンスの記録を完了
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);

    // ループのために再帰呼び出し
    setTimeout(frame, 1000 / 30);
  };
  frame();

  function torus(row, column, irad, orad) {
    const vertexArray = new Array();
    const indexArray = new Array();
    for (let i = 0; i <= row; i++) {
      const r = ((Math.PI * 2) / row) * i;
      const rr = Math.cos(r);
      const ry = Math.sin(r);
      for (let ii = 0; ii <= column; ii++) {
        const tr = ((Math.PI * 2) / column) * ii;
        const tx = (rr * irad + orad) * Math.cos(tr);
        const ty = ry * irad;
        const tz = (rr * irad + orad) * Math.sin(tr);
        vertexArray.push(tx, ty, tz);
        const tc = hsva((360 / column) * ii, 1, 1, 1);
        vertexArray.push(tc[0], tc[1], tc[2], tc[3]);
      }
    }
    for (let i = 0; i < row; i++) {
      for (let ii = 0; ii < column; ii++) {
        const r = (column + 1) * i + ii;
        indexArray.push(r, r + column + 1, r + 1);
        indexArray.push(r + column + 1, r + column + 2, r + 1);
      }
    }
    return [Float32Array.from(vertexArray), Uint16Array.from(indexArray)];
  }

  function hsva(h, s, v, a) {
    if (s > 1 || v > 1 || a > 1) {
      return;
    }
    var th = h % 360;
    var i = Math.floor(th / 60);
    var f = th / 60 - i;
    var m = v * (1 - s);
    var n = v * (1 - s * f);
    var k = v * (1 - s * (1 - f));
    var color = new Array();
    if (!s > 0 && !s < 0) {
      color.push(v, v, v, a);
    } else {
      var r = new Array(v, n, m, m, k, v);
      var g = new Array(k, v, v, n, m, m);
      var b = new Array(m, m, k, v, v, n);
      color.push(r[i], g[i], b[i], a);
    }
    return color;
  }
};
