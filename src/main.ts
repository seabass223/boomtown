import './styles.css';
import { SceneController, type SceneInteractionMode } from './scene/SceneController';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
const toolbar = document.querySelector<HTMLElement>('.mode-toolbar');

if (!canvas) {
  throw new Error('Scene canvas was not found.');
}

const scene = new SceneController(canvas);
const dayModal = document.querySelector<HTMLElement>('.day-modal');
const dayModalButton = document.querySelector<HTMLButtonElement>('.day-modal__button');
const simulationSpeedButton = document.querySelector<HTMLButtonElement>('.simulation-hud__speed');
const simulationPauseButton = document.querySelector<HTMLButtonElement>('.simulation-hud__pause');
const idleWorkerButton = document.querySelector<HTMLButtonElement>('.simulation-worker-panel__idle');
const onboardingDismiss = document.querySelector<HTMLButtonElement>('.simulation-onboarding__dismiss');

toolbar?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
  if (!button) {
    return;
  }

  scene.setInteractionMode(button.dataset.mode as SceneInteractionMode);
});

canvas.addEventListener('scene-mode-change', (event) => {
  const mode = (event as CustomEvent<SceneInteractionMode>).detail;
  toolbar?.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  toolbar?.classList.toggle(
    'is-gameplay-locked',
    mode === 'simulate' && canvas.dataset.simulationActive === 'true',
  );
});

canvas.addEventListener('simulation-state-change', () => {
  toolbar?.classList.toggle(
    'is-gameplay-locked',
    canvas.dataset.simulationActive === 'true',
  );
});

dayModalButton?.addEventListener('click', () => {
  dayModal?.setAttribute('hidden', '');
  scene.handleDayModalAction();
});

simulationSpeedButton?.addEventListener('click', () => {
  scene.cycleSimulationSpeed();
});

simulationPauseButton?.addEventListener('click', () => {
  scene.toggleSimulationPause();
});

idleWorkerButton?.addEventListener('click', () => {
  scene.selectIdleWorkers();
});

onboardingDismiss?.addEventListener('click', () => {
  scene.dismissOnboarding();
});

scene.start();
