// src/App.tsx

import React, { useEffect } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { useTexture, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { generateImageFromJSON } from "../utils/convertTexture";
import * as THREE from "three";

// Terrain component
const Terrain: React.FC = () => {
  const texture = useTexture("/res/textures/terrain-texture.webp"); // Make sure this path is correct after generating the image

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  );
};

// Camera component
const Camera: React.FC = () => {
  return (
    <PerspectiveCamera makeDefault position={[0, 5, 10]} />
  );
};

// Main App component
const App: React.FC = () => {
  useEffect(() => {
    // Only generate the image once during development; after that, use the generated image file
    // Uncomment this if you still need to generate the image from JSON
    // generateImageFromJSON("/res/textures/terrain-texture.json");
  }, []);

  return (
    <Canvas
      shadows
      style={{
        width: "100%",
        height: "100vh",
        display: "block",
      }}
    >
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <Camera />
      <Terrain />
      <OrbitControls />
    </Canvas>
  );
};

export default App;
