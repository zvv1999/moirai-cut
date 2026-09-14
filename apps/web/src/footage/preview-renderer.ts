export interface PreviewPlan {
	lut?: { size: number; values: number[] };
	rotation: number;
	flipHorizontal?: boolean;
	flipVertical?: boolean;
	zoom?: { startScale: number; endScale: number; durationSeconds: number };
	geometry: {
		width: number;
		height: number;
		cropWidth: number;
		cropHeight: number;
		cropX: number;
		cropY: number;
	};
	brightness: number;
	contrast: number;
	saturation: number;
}

export function createPreviewRenderer(canvas: HTMLCanvasElement) {
	const gl = canvas.getContext("webgl", {
		alpha: false,
		preserveDrawingBuffer: true,
	});
	if (!gl) throw new Error("当前浏览器无法启动实时预览，请启用硬件加速");
	const compile = (type: number, source: string) => {
		const shader = gl.createShader(type)!;
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			gl.deleteShader(shader);
			throw new Error("实时预览着色器初始化失败");
		}
		return shader;
	};
	const vertex = compile(
		gl.VERTEX_SHADER,
		`
		attribute vec2 position;
		varying vec2 uv;
		void main() { uv = vec2((position.x + 1.0) / 2.0, (1.0 - position.y) / 2.0); gl_Position = vec4(position, 0.0, 1.0); }
	`,
	);
	const fragment = compile(
		gl.FRAGMENT_SHADER,
		`
		precision highp float;
		varying vec2 uv;
		uniform sampler2D frame;
		uniform vec4 crop;
		uniform int rotation;
		uniform vec2 mirror;
		uniform float zoom;
		uniform vec3 color;
		uniform sampler2D lut;
		uniform float lutSize;
		vec3 lookup(vec3 index) {
			return texture2D(lut, vec2((index.x + index.z * lutSize + 0.5) / (lutSize * lutSize), (index.y + 0.5) / lutSize)).rgb;
		}
		vec3 applyLut(vec3 rgb) {
			vec3 p = clamp(rgb, 0.0, 1.0) * (lutSize - 1.0);
			vec3 a = floor(p), b = min(a + 1.0, lutSize - 1.0), f = p - a;
			return mix(mix(mix(lookup(a), lookup(vec3(b.x,a.y,a.z)), f.x), mix(lookup(vec3(a.x,b.y,a.z)),lookup(vec3(b.x,b.y,a.z)),f.x),f.y),
				mix(mix(lookup(vec3(a.x,a.y,b.z)),lookup(vec3(b.x,a.y,b.z)),f.x),mix(lookup(vec3(a.x,b.y,b.z)),lookup(b),f.x),f.y),f.z);
		}
		void main() {
			vec2 zoomed = (uv - 0.5) / zoom + 0.5;
			vec2 p = crop.xy + mix(zoomed, 1.0 - zoomed, mirror) * crop.zw;
			if (rotation == 90) p = vec2(p.y, 1.0 - p.x);
			else if (rotation == 180) p = 1.0 - p;
			else if (rotation == 270) p = vec2(1.0 - p.y, p.x);
			vec3 rgb = texture2D(frame, p).rgb;
			if (lutSize > 0.0) {
				gl_FragColor = vec4(clamp(applyLut(rgb), 0.0, 1.0), 1.0);
				return;
			}
			float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
			float y = luma * (219.0 / 255.0) + 16.0 / 255.0;
			float adjusted = clamp((y - 0.5) * color.y + 0.5 + color.x, 0.0, 1.0);
			float outputLuma = (adjusted - 16.0 / 255.0) * (255.0 / 219.0);
			gl_FragColor = vec4(clamp(vec3(outputLuma) + (rgb - luma) * color.z, 0.0, 1.0), 1.0);
		}
	`,
	);
	const program = gl.createProgram()!;
	gl.attachShader(program, vertex);
	gl.attachShader(program, fragment);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS))
		throw new Error("实时预览初始化失败");
	gl.useProgram(program);
	const buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(
		gl.ARRAY_BUFFER,
		new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
		gl.STATIC_DRAW,
	);
	const position = gl.getAttribLocation(program, "position");
	gl.enableVertexAttribArray(position);
	gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	const crop = gl.getUniformLocation(program, "crop");
	const rotation = gl.getUniformLocation(program, "rotation");
	const mirror = gl.getUniformLocation(program, "mirror");
	const zoom = gl.getUniformLocation(program, "zoom");
	const color = gl.getUniformLocation(program, "color");
	const lutSize = gl.getUniformLocation(program, "lutSize");
	const lutTexture = gl.createTexture();
	const floatTextures = gl.getExtension("OES_texture_float");
	let lastLut: PreviewPlan["lut"];
	gl.uniform1i(gl.getUniformLocation(program, "frame"), 0);
	gl.uniform1i(gl.getUniformLocation(program, "lut"), 1);
	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, lutTexture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.RGBA,
		1,
		1,
		0,
		gl.RGBA,
		gl.UNSIGNED_BYTE,
		new Uint8Array([0, 0, 0, 255]),
	);
	return {
		draw(video: HTMLVideoElement, plan: PreviewPlan) {
			if (video.readyState < 2 || gl.isContextLost()) return;
			const g = plan.geometry;
			const scale = Math.min(1, 960 / Math.max(g.cropWidth, g.cropHeight));
			const width = Math.max(1, Math.round(g.cropWidth * scale));
			const height = Math.max(1, Math.round(g.cropHeight * scale));
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
			}
			gl.viewport(0, 0, width, height);
			if (plan.lut && plan.lut !== lastLut) {
				if (!floatTextures)
					throw new Error("当前浏览器不支持 AI 调色预览，请启用硬件加速");
				const { size, values } = plan.lut;
				const pixels = new Float32Array(size * size * size * 4);
				for (let b = 0; b < size; b++)
					for (let g = 0; g < size; g++)
						for (let r = 0; r < size; r++) {
							const from = ((b * size + g) * size + r) * 3;
							const to = (g * size * size + b * size + r) * 4;
							pixels.set(
								[values[from], values[from + 1], values[from + 2], 1],
								to,
							);
						}
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, lutTexture);
				gl.texImage2D(
					gl.TEXTURE_2D,
					0,
					gl.RGBA,
					size * size,
					size,
					0,
					gl.RGBA,
					gl.FLOAT,
					pixels,
				);
				lastLut = plan.lut;
			}
			gl.uniform1f(lutSize, plan.lut?.size ?? 0);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
			gl.uniform4f(
				crop,
				g.cropX / g.width,
				g.cropY / g.height,
				g.cropWidth / g.width,
				g.cropHeight / g.height,
			);
			gl.uniform1i(rotation, plan.rotation);
			const motion = plan.zoom;
			const progress = motion && motion.durationSeconds > 0
				? Math.max(0, Math.min(1, video.currentTime / motion.durationSeconds))
				: 0;
			gl.uniform1f(zoom, motion
				? motion.startScale + (motion.endScale - motion.startScale) * progress
				: 1);
			gl.uniform2f(
				mirror,
				plan.flipHorizontal ? 1 : 0,
				plan.flipVertical ? 1 : 0,
			);
			gl.uniform3f(color, plan.brightness, plan.contrast, plan.saturation);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		},
		dispose() {
			gl.deleteTexture(lutTexture);
			gl.deleteTexture(texture);
			gl.deleteBuffer(buffer);
			gl.deleteProgram(program);
			gl.deleteShader(vertex);
			gl.deleteShader(fragment);
		},
	};
}
