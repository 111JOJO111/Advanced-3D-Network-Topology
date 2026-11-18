// CONTRAT COMMUN — format des fichiers de scénario (voir docs/format-scenario.md).
// Ce module valide un scénario JSON et le charge depuis une URL.

import { isIp, isMac } from './addr.js';

export const SCENARIO_FORMAT = 1;
export const DEVICE_TYPES = Object.freeze(['host', 'server', 'switch', 'router']);

const isText = (value) => !!value && typeof value.fr === 'string' && typeof value.en === 'string';

/** Découpe « pc1:eth0 » en { device: 'pc1', iface: 'eth0' }. */
export function parseEndpoint(text) {
  const [device, iface] = String(text).split(':');
  return { device, iface };
}

/**
 * Vérifie un scénario. Retourne { ok, errors } ; `errors` liste tout ce qui ne respecte
 * pas le format, avec le chemin de l'élément fautif.
 */
export function validateScenario(scenario) {
  const errors = [];
  const fail = (message) => errors.push(message);
  if (!scenario || typeof scenario !== 'object') return { ok: false, errors: ['le scénario doit être un objet JSON'] };

  if (scenario.format !== SCENARIO_FORMAT) fail(`format : attendu ${SCENARIO_FORMAT}`);
  if (!scenario.id || !/^[a-z0-9-]+$/.test(scenario.id)) fail('id : minuscules, chiffres et tirets uniquement');
  if (!isText(scenario.title)) fail('title : il faut { fr, en }');
  if (!isText(scenario.summary)) fail('summary : il faut { fr, en }');
  if (!Array.isArray(scenario.protocols)) fail('protocols : liste attendue');

  const devices = new Map();
  const macs = new Set();
  if (!Array.isArray(scenario.devices) || scenario.devices.length === 0) fail('devices : au moins un équipement');
  for (const [i, device] of (scenario.devices || []).entries()) {
    const where = `devices[${i}]`;
    if (!device.id) { fail(`${where}.id manquant`); continue; }
    if (devices.has(device.id)) fail(`${where}.id « ${device.id} » en double`);
    devices.set(device.id, device);
    if (!DEVICE_TYPES.includes(device.type)) fail(`${where}.type inconnu « ${device.type} »`);
    if (!device.name) fail(`${where}.name manquant`);
    if (!Array.isArray(device.position) || device.position.length !== 3 || device.position.some((n) => typeof n !== 'number')) {
      fail(`${where}.position : [x, y, z] attendu`);
    }
    for (const [j, iface] of (device.interfaces || []).entries()) {
      const at = `${where}.interfaces[${j}]`;
      if (!iface.name) fail(`${at}.name manquant`);
      if (device.type !== 'switch') {
        if (!isMac(iface.mac)) fail(`${at}.mac invalide`);
        else if (macs.has(iface.mac.toUpperCase())) fail(`${at}.mac « ${iface.mac} » en double`);
        else macs.add(iface.mac.toUpperCase());
        if (iface.ip != null) {
          if (!isIp(iface.ip)) fail(`${at}.ip invalide`);
          if (!Number.isInteger(iface.prefix) || iface.prefix < 1 || iface.prefix > 30) fail(`${at}.prefix : entier de 1 à 30`);
        }
      }
    }
    if (device.type !== 'switch' && !(device.interfaces || []).length) fail(`${where}.interfaces : au moins une interface`);
    if (device.gateway != null && !isIp(device.gateway)) fail(`${where}.gateway invalide`);
    for (const [j, route] of (device.routes || []).entries()) {
      if (!isIp(route.network) || !Number.isInteger(route.prefix) || !isIp(route.via)) {
        fail(`${where}.routes[${j}] : { network, prefix, via } attendu`);
      }
    }
  }

  const linkIds = new Set();
  const usedPorts = new Set();
  for (const [i, link] of (scenario.links || []).entries()) {
    const where = `links[${i}]`;
    if (!link.id) fail(`${where}.id manquant`);
    if (linkIds.has(link.id)) fail(`${where}.id « ${link.id} » en double`);
    linkIds.add(link.id);
    for (const side of ['a', 'b']) {
      const end = parseEndpoint(link[side]);
      const device = devices.get(end.device);
      if (!device) { fail(`${where}.${side} : équipement « ${end.device} » inconnu`); continue; }
      if (!end.iface) { fail(`${where}.${side} : écrire « equipement:interface »`); continue; }
      if (device.type !== 'switch' && !(device.interfaces || []).some((it) => it.name === end.iface)) {
        fail(`${where}.${side} : interface « ${end.iface} » absente de ${end.device}`);
      }
      if (usedPorts.has(link[side])) fail(`${where}.${side} : « ${link[side]} » est déjà câblé`);
      usedPorts.add(link[side]);
    }
  }

  if (!Array.isArray(scenario.steps)) fail('steps : liste attendue (elle peut être vide)');
  for (const [i, step] of (scenario.steps || []).entries()) {
    const where = `steps[${i}]`;
    if (!step.action) fail(`${where}.action manquante`);
    if (step.from && !devices.has(step.from)) fail(`${where}.from : équipement « ${step.from} » inconnu`);
    if (step.title && !isText(step.title)) fail(`${where}.title : il faut { fr, en }`);
    if (step.explanation && !isText(step.explanation)) fail(`${where}.explanation : il faut { fr, en }`);
    for (const id of step.path || []) {
      if (!devices.has(id)) fail(`${where}.path : équipement « ${id} » inconnu`);
    }
  }

  for (const [key, text] of Object.entries(scenario.explanations || {})) {
    if (!isText(text)) fail(`explanations["${key}"] : il faut { fr, en }`);
  }
  return { ok: errors.length === 0, errors };
}

/** Charge et valide un scénario. `fetchImpl` permet de tester sans réseau. */
export async function fetchScenario(url, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Scénario introuvable : ${url} (HTTP ${response.status})`);
  const scenario = await response.json();
  const { ok, errors } = validateScenario(scenario);
  if (!ok) throw new Error(`Scénario invalide (${url}) :\n- ` + errors.join('\n- '));
  return scenario;
}
