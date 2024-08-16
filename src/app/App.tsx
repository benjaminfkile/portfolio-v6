import React, { useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

// Terrain component (fixed, does not move or rotate)
const Terrain = () => {
  const [texture, displacementMap] = useTexture([
    "/res/textures/terrain-texture.jpg",
    "/res/textures/height-map.png",
  ]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[100, 100, 512, 512]} />
      <meshStandardMaterial
        map={texture}
        displacementMap={displacementMap}
        displacementScale={1}
      />
    </mesh>
  );
};

// Player component (moves and rotates)
const Player: React.FC<{ position: THREE.Vector3; rotation: THREE.Euler }> = ({ position, rotation }) => {
  return (
    <mesh position={position} rotation={rotation} castShadow>
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
  const playerPosition = useRef(new THREE.Vector3(0, 2, 0));
  const playerRotation = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
  const rotationAngle = useRef(0); // Player's rotation angle

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

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useFrame(() => {
    const velocity = 0.1;
    const direction = new THREE.Vector3();
  
    // Calculate forward and right vectors based on current rotation
    const forwardVector = new THREE.Vector3(
      Math.sin(rotationAngle.current),
      0,
      Math.cos(rotationAngle.current)
    );
    const rightVector = new THREE.Vector3(
      Math.sin(rotationAngle.current + Math.PI / 2),
      0,
      Math.cos(rotationAngle.current + Math.PI / 2)
    );
  
    // Apply movement in the correct direction
    if (moveForward) direction.add(forwardVector.multiplyScalar(velocity));
    if (moveBackward) direction.add(forwardVector.multiplyScalar(-velocity));
  
    // Apply rotation when pressing left or right keys
    if (moveLeft) rotationAngle.current += 0.03;
    if (moveRight) rotationAngle.current -= 0.03;
  
    // Update player position and rotation
    playerPosition.current.add(direction);
    playerRotation.current.set(0, rotationAngle.current, 0);
  
    // Update camera position to follow the player from behind
    const cameraOffset = new THREE.Vector3(0, 5, -10).applyEuler(playerRotation.current);
    camera.position.copy(playerPosition.current.clone().add(cameraOffset));
    camera.lookAt(playerPosition.current);
  
    // Calculate the player position slightly in front of the camera
    const foo = playerPosition.current.clone().add(forwardVector.multiplyScalar(.002));
  
    // Pass the updated position to the Player component
    setFoo(foo);
  });
  
  // State to store the updated foo value
  const [foo, setFoo] = useState(new THREE.Vector3());
  
  return <Player position={foo} rotation={playerRotation.current} />;
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
      <Terrain />
      <Controls />
    </Canvas>
  );
};

export default App;
