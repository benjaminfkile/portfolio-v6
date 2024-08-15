import React, { useRef, useState, useEffect, forwardRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

// Terrain component
const Terrain = forwardRef<THREE.Mesh>((props, ref) => {
  const [texture, displacementMap] = useTexture([
    "/res/textures/terrain-texture.jpg",
    "/res/textures/height-map.png",
  ]);

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[100, 100, 512, 512]} />
      <meshStandardMaterial
        map={texture}
        displacementMap={displacementMap}
        displacementScale={1}
      />
    </mesh>
  );
});

// Player component (fixed at the center)
const Player: React.FC = () => {
  return (
    <mesh position={[0, 2, 0]} castShadow>
      <sphereGeometry args={[1, 32, 32]} />
      <meshStandardMaterial color="red" />
    </mesh>
  );
};

// Controls component
const Controls: React.FC = () => {
  const { camera } = useThree();
  const [moveForward, setMoveForward] = useState(false);
  const [moveBackward, setMoveBackward] = useState(false);
  const [moveLeft, setMoveLeft] = useState(false);
  const [moveRight, setMoveRight] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [panRotation, setPanRotation] = useState({ x: 0, y: 0 });
  const terrainRef = useRef<THREE.Mesh>(null);
  const terrainPosition = useRef(new THREE.Vector3(0, 0, 0));

  const handleKeyDown = (event: KeyboardEvent) => {
    switch (event.code) {
      case "KeyW":
        setMoveForward(true);
        break;
      case "KeyS":
        setMoveBackward(true);
        break;
      case "KeyA":
        setMoveLeft(true);
        break;
      case "KeyD":
        setMoveRight(true);
        break;
    }
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    switch (event.code) {
      case "KeyW":
        setMoveForward(false);
        break;
      case "KeyS":
        setMoveBackward(false);
        break;
      case "KeyA":
        setMoveLeft(false);
        break;
      case "KeyD":
        setMoveRight(false);
        break;
    }
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (event.button === 0) {
      setIsPanning(true);
    }
  };

  const handleMouseUp = (event: MouseEvent) => {
    if (event.button === 0) {
      setIsPanning(false);
      setPanRotation({ x: 0, y: 0 });
    }
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (isPanning) {
      setPanRotation((prev) => ({
        x: THREE.MathUtils.clamp(prev.x - event.movementY * 0.002, -Math.PI / 3, Math.PI / 3),
        y: prev.y - event.movementX * 0.002,
      }));
    }
  };

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isPanning]);

  useFrame(() => {
    const velocity = 0.1;
    if (moveForward) terrainPosition.current.z += velocity;
    if (moveBackward) terrainPosition.current.z -= velocity;
    if (moveLeft) terrainPosition.current.x += velocity;
    if (moveRight) terrainPosition.current.x -= velocity;

    // Update terrain position directly using ref
    if (terrainRef.current) {
      terrainRef.current.position.copy(terrainPosition.current);
    }

    // Camera positioning logic
    const cameraOffset = new THREE.Vector3(0, 2, 5);
    const desiredCameraPosition = cameraOffset
      .clone()
      .applyEuler(new THREE.Euler(panRotation.x, panRotation.y + rotation.y, 0, "YXZ"));

    camera.position.lerp(desiredCameraPosition, 0.1);
    camera.lookAt(new THREE.Vector3(0, 2, 0)); // Keep looking at the fixed player position
  });

  return <Terrain ref={terrainRef} />;
};

// Main App component
const App: React.FC = () => {
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
        position={[10, 20, 10]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={10000}
        shadow-mapSize-height={10000}
      />
      <Player />
      <Controls />
    </Canvas>
  );
};

export default App;
