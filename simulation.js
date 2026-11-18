// Façade de la simulation : le seul point d'entrée utilisé par main.js, l'interface et
// le rendu 3D. Elle assemble le moteur, le bus d'évènements, les commandes, le registre
// des protocoles et le réseau simulé.
//
//   const sim = createSimulation();
//   await sim.loadScenarioFromUrl('scenarios/ping.json');
//   sim.on('packet:send', (event) => …);   // s'abonner (patron Observer)
//   sim.execute('play');                    // commander (patron Command)
//   sim.tick(dtMs);                         // à chaque image

import { Topics } from './src/sim/events.js';
import { Engine, SPEEDS } from './src/sim/engine.js';
import { createCommands } from './src/sim/commands.js';
import { ProtocolRegistry } from './src/sim/registry.js';
import { fetchScenario, validateScenario } from './src/sim/scenario.js';

export { Topics, SPEEDS };

/** Pause entre deux étapes d'un scénario (ms simulées). */
const STEP_GAP = 600;

export function createSimulation() {
  const engine = new Engine();
  const bus = engine.bus;
  const registry = new ProtocolRegistry();
  const commands = createCommands(engine);

  const sim = {
    bus,
    engine,
    registry,
    commands,
    scenario: null,
    network: null,

    get state() { return engine.state; },
    get now() { return engine.now; },
    get speed() { return engine.speed; },

    /** S'abonner à un sujet du bus ; retourne la fonction de désabonnement. */
    on(topic, listener) { return bus.on(topic, listener); },

    /** Exécute une commande : 'play', 'pause', 'step', 'speed' (avec valeur), 'reset'. */
    execute(name, argument) {
      const command = commands[name];
      if (!command) throw new Error(`Commande inconnue : ${name}`);
      return command.execute(argument);
    },

    can(name) { return !!commands[name] && commands[name].canExecute(); },

    /** À appeler à chaque image avec le temps réel écoulé en millisecondes. */
    tick(realDtMs) { engine.tick(realDtMs); },

    /** Charge un scénario déjà lu (objet JSON). */
    async loadScenario(scenario) {
      const { ok, errors } = validateScenario(scenario);
      if (!ok) throw new Error('Scénario invalide :\n- ' + errors.join('\n- '));
      sim.scenario = scenario;
      engine.reset();
      bus.emit(Topics.SCENARIO_LOADED, { scenario });
      return scenario;
    },

    async loadScenarioFromUrl(url, fetchImpl) {
      return sim.loadScenario(await fetchScenario(url, fetchImpl));
    },

    /** Texte { fr, en } d'une clé d'explication : le scénario peut redéfinir un texte. */
    text(key) {
      const own = sim.scenario && sim.scenario.explanations && sim.scenario.explanations[key];
      return own || registry.text(key);
    },
  };

  return sim;
}
