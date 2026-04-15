import { GLTFExporter } from 'gltf-exporter';

export async function exportSceneToGLB(scene) {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: true,
    trs: false,
  });
  return new Blob([result], { type: 'model/gltf-binary' });
}
