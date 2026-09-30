/**
 * Описание той части three, которой пользуется сцена «Город в 3D».
 * Сама библиотека идёт без описаний типов; полный набор — отдельный пакет @types/three.
 * Если его подключат, этот файл можно удалить: описания из пакета имеют приоритет.
 */
declare module "three" {
  export class Color {
    constructor(value?: string | number);
    set(value: string | number | Color): this;
  }

  export class Vector2 {
    x: number;
    y: number;
    set(x: number, y: number): this;
  }

  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
    /** Мировые координаты → координаты кадра от −1 до 1. */
    project(camera: Camera): this;
  }

  export class Euler {
    x: number;
    y: number;
    z: number;
  }

  export class Matrix4 {}

  export class Object3D {
    position: Vector3;
    rotation: Euler;
    scale: Vector3;
    matrix: Matrix4;
    visible: boolean;
    castShadow: boolean;
    receiveShadow: boolean;
    add(...objects: Object3D[]): this;
    remove(...objects: Object3D[]): this;
    lookAt(x: number, y: number, z: number): void;
    updateMatrix(): void;
    updateMatrixWorld(force?: boolean): void;
  }

  export class Group extends Object3D {}
  export class Scene extends Object3D {}
  export class Camera extends Object3D {}

  export class PerspectiveCamera extends Camera {
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    fov: number;
    aspect: number;
    updateProjectionMatrix(): void;
    /** Показывает часть большего кадра: сдвигает изображение, не трогая точку, вокруг которой вращается камера. */
    setViewOffset(fullWidth: number, fullHeight: number, x: number, y: number, width: number, height: number): void;
  }

  export class OrthographicCamera extends Camera {
    left: number;
    right: number;
    top: number;
    bottom: number;
    near: number;
    far: number;
    updateProjectionMatrix(): void;
  }

  export class BufferAttribute {
    needsUpdate: boolean;
  }

  export class Float32BufferAttribute extends BufferAttribute {
    constructor(array: number[], itemSize: number);
  }

  export class BufferGeometry {
    setAttribute(name: string, attribute: BufferAttribute): this;
    setIndex(index: number[]): this;
    translate(x: number, y: number, z: number): this;
    rotateX(angle: number): this;
    rotateY(angle: number): this;
    dispose(): void;
  }

  export class BoxGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, depth?: number);
  }

  export class ConeGeometry extends BufferGeometry {
    constructor(radius?: number, height?: number, radialSegments?: number);
  }

  export class CylinderGeometry extends BufferGeometry {
    constructor(radiusTop?: number, radiusBottom?: number, height?: number, radialSegments?: number);
  }

  export class SphereGeometry extends BufferGeometry {
    constructor(radius?: number, widthSegments?: number, heightSegments?: number);
  }

  export class RingGeometry extends BufferGeometry {
    constructor(innerRadius?: number, outerRadius?: number, thetaSegments?: number);
  }

  export class Shape {
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
  }

  export class ShapeGeometry extends BufferGeometry {
    constructor(shape: Shape);
  }

  type MaterialOptions = {
    color?: string | number;
    transparent?: boolean;
    opacity?: number;
    depthWrite?: boolean;
    flatShading?: boolean;
  };

  export class Material {
    color: Color;
    transparent: boolean;
    opacity: number;
    dispose(): void;
  }

  export class MeshLambertMaterial extends Material {
    constructor(options?: MaterialOptions);
  }

  export class MeshBasicMaterial extends Material {
    constructor(options?: MaterialOptions);
  }

  export class Mesh extends Object3D {
    constructor(geometry: BufferGeometry, material: Material | Material[]);
    geometry: BufferGeometry;
    material: Material | Material[];
  }

  export class InstancedMesh extends Mesh {
    constructor(geometry: BufferGeometry, material: Material, count: number);
    count: number;
    instanceMatrix: BufferAttribute;
    instanceColor: BufferAttribute | null;
    setMatrixAt(index: number, matrix: Matrix4): void;
    setColorAt(index: number, color: Color): void;
    dispose(): void;
  }

  export class Light extends Object3D {
    color: Color;
    intensity: number;
  }

  export class HemisphereLight extends Light {
    constructor(skyColor?: string | number, groundColor?: string | number, intensity?: number);
    groundColor: Color;
  }

  export class DirectionalLight extends Light {
    constructor(color?: string | number, intensity?: number);
    shadow: { mapSize: Vector2; camera: OrthographicCamera; bias: number; normalBias: number };
  }

  export class WebGLRenderer {
    constructor(options: { canvas: HTMLCanvasElement; antialias?: boolean; alpha?: boolean });
    shadowMap: { enabled: boolean; autoUpdate: boolean; needsUpdate: boolean };
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: Scene, camera: Camera): void;
    dispose(): void;
  }
}
