// Animation des paquets sur les câbles.
//
// Règle centrale : la position d'un paquet est calculée à partir de l'horloge SIMULÉE
// (sim.now) et non du nombre d'images affichées. Conséquences : en pause les paquets se
// figent, à vitesse ×4 ils vont quatre fois plus vite, et un appareil lent affiche
// exactement la même simulation qu'un appareil rapide, simplement avec moins d'images.
//
// Un paquet arrivé reste visible devant son destinataire jusqu'au départ des paquets
// suivants : après un « pas à pas », on peut ainsi cliquer dessus pour l'inspecter.

import * as THREE from 'three';
import { Topics } from '../sim/events.js';

/** Les paquets s'arrêtent un peu avant le centre de l'équipement pour rester visibles. */
const END_MARGIN = 1.0;
const ARC_HEIGHT = 0.3;

// Géométries et matériaux partagés entre tous les paquets (important sur mobile).
const geometries = {
  box: new THREE.BoxGeometry(0.5, 0.3, 0.36),
  sphere: new THREE.SphereGeometry(0.26, 20, 14),
  octahedron: new THREE.OctahedronGeometry(0.32),
  halo: new THREE.TorusGeometry(0.42, 0.035, 8, 32),
};
geometries.halo.rotateX(Math.PI / 2);
const materials = new Map();

function material(color, halo = false) {
  const key = color + (halo ? ':halo' : '');
  if (!materials.has(key)) {
    materials.set(key, halo
      ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 })
      : new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.4 }));
  }
  return materials.get(key);
}

export function createPacketAnimator(render, sim) {
  const flights = new Map(); // tx -> trajet en cours ou paquet arrivé

  function place(flight, now) {
    const progress = Math.min(1, Math.max(0, (now - flight.start) / flight.duration));
    flight.mesh.position.lerpVectors(flight.from, flight.to, progress);
    flight.mesh.position.y += Math.sin(progress * Math.PI) * ARC_HEIGHT;
    if (flight.halo && flight.style.pulse) {
      flight.halo.scale.setScalar(1 + 0.3 * Math.abs(Math.sin(now / 260)));
    }
  }

  function remove(tx) {
    const flight = flights.get(tx);
    if (!flight) return;
    render.packetLayer.remove(flight.mesh);
    flights.delete(tx);
  }

  function clear() {
    for (const tx of [...flights.keys()]) remove(tx);
  }

  sim.on(Topics.PACKET_SEND, (event) => {
    // Les paquets arrivés à une date antérieure laissent la place aux nouveaux.
    for (const [tx, flight] of flights) {
      if (flight.arrivedAt !== null && flight.arrivedAt < event.time) remove(tx);
    }
    if (flights.size >= render.maxPackets) return; // garde-fou de fluidité

    const style = render.packetStyle(event.packet);
    const mesh = new THREE.Mesh(geometries[style.shape] || geometries.sphere, material(style.color));
    mesh.userData = { kind: 'packet', packet: event.packet, tx: event.tx };

    const from = render.anchor(event.from);
    const to = render.anchor(event.to);
    const direction = to.clone().sub(from);
    const margin = Math.min(END_MARGIN, direction.length() * 0.3);
    direction.normalize();
    from.addScaledVector(direction, margin);
    to.addScaledVector(direction, -margin);
    mesh.rotation.y = Math.atan2(-direction.z, direction.x); // l'enveloppe suit le câble

    const flight = { mesh, from, to, start: event.time, duration: event.duration, style, halo: null, arrivedAt: null };
    if (style.halo) {
      flight.halo = new THREE.Mesh(geometries.halo, material(style.color, true));
      flight.halo.raycast = () => {};
      mesh.add(flight.halo);
    }
    const label = render.makeLabel([event.packet.label], { size: 0.62, accent: style.color });
    if (label) {
      label.position.y = 0.62;
      mesh.add(label);
    }
    place(flight, sim.now);
    render.packetLayer.add(mesh);
    flights.set(event.tx, flight);
  });

  sim.on(Topics.PACKET_RECEIVE, (event) => {
    const flight = flights.get(event.tx);
    if (flight) flight.arrivedAt = event.time;
  });

  sim.on(Topics.RESET, clear);
  sim.on(Topics.SCENARIO_LOADED, clear);

  render.onFrame(() => {
    const now = sim.now;
    for (const flight of flights.values()) place(flight, now);
  });

  return { flights, clear };
}
