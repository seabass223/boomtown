import './styles.css';
import { SceneController } from './scene/SceneController';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');

if (!canvas) {
  throw new Error('Scene canvas was not found.');
}

const scene = new SceneController(canvas);
scene.start();
