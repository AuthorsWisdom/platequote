"use client";

import { Bounds, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Component, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";

type PreviewProps = {
  url: string | null;
  filename: string;
  color: string;
};

class PreviewBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="p-6 text-sm text-muted-foreground">
          The 3D preview is unavailable in this browser. The quote does not need it.
        </p>
      );
    }
    return this.props.children;
  }
}

function paint(root: THREE.Object3D, material: THREE.Material) {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) child.material = material;
  });
}

export function ModelPreview({ url, filename, color }: PreviewProps) {
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        metalness: 0.08,
        roughness: 0.48,
      }),
    // The material object is stable; color updates below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    material.color.set(color);
  }, [color, material]);

  useEffect(() => {
    if (!url) {
      setObject(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    const lower = filename.toLowerCase();
    const apply = (root: THREE.Object3D) => {
      paint(root, material);
      if (!cancelled) setObject(root);
    };
    if (lower.endsWith(".3mf")) {
      new ThreeMFLoader().load(url, apply, undefined, () => {
        if (!cancelled) setError("This 3MF could not be previewed. The server can still try to slice it.");
      });
    } else {
      new STLLoader().load(
        url,
        (geometry) => {
          geometry.computeVertexNormals();
          apply(new THREE.Mesh(geometry, material));
        },
        undefined,
        () => {
          if (!cancelled) setError("This STL could not be previewed. The server can still try to slice it.");
        },
      );
    }
    return () => {
      cancelled = true;
    };
  }, [url, filename, material]);

  if (!url) {
    return (
      <div className="flex h-full min-h-64 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        The part shows up here, bed-side up, before anything is priced.
      </div>
    );
  }

  if (error) {
    return <p className="p-6 text-sm text-muted-foreground">{error}</p>;
  }

  return (
    <PreviewBoundary>
      <Canvas camera={{ position: [80, 60, 80], fov: 35 }} className="h-full min-h-64">
        <color attach="background" args={["#f6f1e6"]} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[30, 50, 20]} intensity={1.3} />
        {object ? (
          <Bounds fit clip observe margin={1.25}>
            <group rotation={[-Math.PI / 2, 0, 0]}>
              <primitive object={object} />
            </group>
          </Bounds>
        ) : null}
        <OrbitControls makeDefault />
      </Canvas>
    </PreviewBoundary>
  );
}
