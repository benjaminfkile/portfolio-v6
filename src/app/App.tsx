import React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Hedron from "../components/Hedron";

const App: React.FC = () => {
  return (
    <Canvas
      camera={{ position: [0, 0, 50], fov: 50 }}
      style={{
        width: "100vw",
        height: "100vh"
      }}

    >
      <ambientLight intensity={0.8} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <Hedron initialFaces={20}
        subdivisions={1}
        scale={1}
      />
      <OrbitControls />
    </Canvas>
  );
};

export default App;
