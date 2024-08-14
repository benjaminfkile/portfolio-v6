import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface TriangleMeshProps {
  initialFaces: number;  // Control the initial complexity (e.g., 4 for tetrahedron, 20 for icosahedron)
  subdivisions: number;  // Subdivide to increase the number of faces
  scale?: number;
}

const TriangleMesh: React.FC<TriangleMeshProps> = ({ initialFaces = 20, subdivisions = 1, scale = 1 }) => {
  const meshRef = useRef<THREE.Mesh>(null!);
  const edgesRef = useRef<THREE.LineSegments>(null!);
  const rotationSpeed = .005

  const geometry = useMemo(() => {
    let baseGeometry;
    
    // Choose base geometry based on the initial number of faces
    switch (initialFaces) {
      case 4:
        baseGeometry = new THREE.TetrahedronGeometry(10, subdivisions);
        break;
      case 8:
        baseGeometry = new THREE.OctahedronGeometry(10, subdivisions);
        break;
      case 12:
        baseGeometry = new THREE.DodecahedronGeometry(10, subdivisions);
        break;
      case 20:
      default:
        baseGeometry = new THREE.IcosahedronGeometry(10, subdivisions);
        break;
    }

    return baseGeometry;
  }, [initialFaces, subdivisions]);

  const edges = useMemo(() => {
    return new THREE.EdgesGeometry(geometry); // Creates an EdgesGeometry to outline the triangles
  }, [geometry]);

  // useFrame(() => {
  //   if (meshRef.current) {
  //     meshRef.current.rotation.y += rotationSpeed;
  //   }
  //   if (edgesRef.current) {
  //     edgesRef.current.rotation.y += rotationSpeed;
  //   }
  // });

  return (
    <>
      <mesh ref={meshRef} geometry={geometry} scale={[scale, scale, scale]}>
        <meshStandardMaterial color="#000000" side={THREE.DoubleSide} />
      </mesh>
      <lineSegments ref={edgesRef} geometry={edges} scale={[scale, scale, scale]}>
        <lineBasicMaterial color="#1F51FF" />
      </lineSegments>
    </>
  );
};

export default TriangleMesh;
