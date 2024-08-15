// src/convertTexture.ts

import * as THREE from "three";

export async function loadTextureFromJSON(url: string): Promise<THREE.Texture> {
  const response = await fetch(url);
  const textureJSON = await response.json();

  const loader = new THREE.ObjectLoader();
  const texture = loader.parse(textureJSON);

  //@ts-ignore
  return texture;
}

export function renderTextureToCanvas(texture: THREE.Texture) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  // Set canvas size
  canvas.width = texture.image.width;
  canvas.height = texture.image.height;

  // Draw the texture on the canvas
  context?.drawImage(texture.image, 0, 0);

  // Export the canvas as an image
  const dataURL = canvas.toDataURL("image/png");
  downloadImage(dataURL, "texture-image.png");

  return canvas;
}

export function downloadImage(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Main function to handle the full process
export async function generateImageFromJSON(jsonUrl: string) {
  const texture = await loadTextureFromJSON(jsonUrl);
  renderTextureToCanvas(texture);
}
