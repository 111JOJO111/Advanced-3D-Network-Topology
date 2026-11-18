// Réseau simulé : les équipements, les câbles et la circulation des trames.
// Ce module ne connaît aucun protocole : il transporte des paquets d'un bout à l'autre
// d'un câble et les remet à l'équipement d'arrivée.

import { Topics, createPacket, note, HOP_DURATION, PROCESS_DELAY } from './events.js';
import { parseEndpoint } from './scenario.js';

/** Textes des explications produites par le réseau lui-même. */
export const CORE_TEXTS = {
  'trace.hop': {
    fr: 'Paquet de test : {from} l\'envoie à {to} sur le câble qui les relie.',
    en: 'Test packet: {from} sends it to {to} over the cable between them.',
  },
  'trace.arrived': {
    fr: 'Le paquet de test est arrivé à {name}.',
    en: 'The test packet has reached {name}.',
  },
  'net.unplugged': {
    fr: '{name} : l\'interface {iface} n\'est reliée à aucun câble, le paquet est perdu.',
    en: '{name}: interface {iface} has no cable attached, the packet is lost.',
  },
  'sim.unknownAction': {
    fr: 'Action « {action} » inconnue : aucun protocole chargé ne sait la lancer.',
    en: 'Unknown action "{action}": no loaded protocol can start it.',
  },
};

/** Équipement de base : il a des interfaces mais ne réagit à rien. */
export class Device {
  constructor(def, net) {
    this.def = def;
    this.net = net;
    this.id = def.id;
    this.type = def.type;
    this.name = def.name;
    this.interfaces = (def.interfaces || []).map((iface) => ({
      name: iface.name,
      mac: iface.mac ? iface.mac.toUpperCase() : null,
      ip: iface.ip || null,
      prefix: iface.prefix || null,
    }));
  }

  iface(name) {
    return this.interfaces.find((iface) => iface.name === name) || null;
  }

  /** Les ports d'un switch peuvent n'être déclarés que par les câbles. */
  ensureIface(name) {
    if (!this.iface(name)) this.interfaces.push({ name, mac: null, ip: null, prefix: null });
    return this.iface(name);
  }

  /**
   * Réception d'une trame sur une interface.
   * @returns {{accepted: boolean, notes: Array}|undefined}
   */
  receive() {
    return { accepted: true, notes: [] };
  }

  /** Tables internes à afficher dans le panneau d'infos (cache ARP, table MAC…). */
  tables() {
    return [];
  }
}

export class Network {
  /**
   * @param {Object} options
   * @param {Object} options.scenario     scénario validé
   * @param {Object} options.engine       moteur (schedule, cancel, now)
   * @param {Object} options.bus          bus d'évènements
   * @param {Object} options.registry     registre des protocoles
   * @param {Object} [options.deviceTypes] fabriques par type : { host: create, … } (patron Factory)
   */
  constructor({ scenario, engine, bus, registry, deviceTypes = {} }) {
    this.scenario = scenario;
    this.engine = engine;
    this.bus = bus;
    this.registry = registry;
    this.devices = new Map();
    this.links = new Map();
    this.wires = new Map(); // « equipement:interface » -> { linkId, device, iface }
    this.packetSeq = 0;
    this.txSeq = 0;
    this.busyUntil = new Map(); // « equipement:interface » -> date de fin d'émission

    for (const def of scenario.devices) {
      const create = deviceTypes[def.type];
      this.devices.set(def.id, create ? create(def, this) : new Device(def, this));
    }
    for (const link of scenario.links || []) {
      const a = parseEndpoint(link.a);
      const b = parseEndpoint(link.b);
      this.devices.get(a.device).ensureIface(a.iface);
      this.devices.get(b.device).ensureIface(b.iface);
      this.links.set(link.id, { id: link.id, a, b });
      this.wires.set(link.a, { linkId: link.id, device: this.devices.get(b.device), iface: b.iface });
      this.wires.set(link.b, { linkId: link.id, device: this.devices.get(a.device), iface: a.iface });
    }
    for (const protocol of registry ? registry.all() : []) {
      for (const device of this.devices.values()) protocol.install(device, this);
    }
  }

  get now() { return this.engine.now; }

  device(id) { return this.devices.get(id) || null; }

  /** Ce qui se trouve à l'autre bout du câble branché sur `ifaceName`, ou null. */
  peer(deviceId, ifaceName) {
    return this.wires.get(`${deviceId}:${ifaceName}`) || null;
  }

  /** Nom de l'interface de `from` directement câblée vers `to`, ou null. */
  ifaceToward(from, to) {
    for (const iface of from.interfaces) {
      const wire = this.peer(from.id, iface.name);
      if (wire && wire.device === to) return iface.name;
    }
    return null;
  }

  /** Crée un paquet avec un identifiant déterministe. */
  packet(fields) {
    return createPacket(fields, 'p' + (++this.packetSeq));
  }

  /** Copie d'un paquet pour un nouveau saut (nouvel id, même flux), en-têtes modifiables. */
  clone(packet, overrides = {}) {
    const copy = { ...packet, eth: { ...packet.eth }, ...overrides };
    if (packet.ip) copy.ip = { ...packet.ip, ...(overrides.ip || {}) };
    return createPacket({ ...copy, flow: packet.flow }, 'p' + (++this.packetSeq));
  }

  /**
   * Émet `packet` sur l'interface `ifaceName` de `device`.
   * Deux évènements sont programmés : le départ (après le temps de traitement) puis
   * l'arrivée (après la traversée du câble). L'arrivée est une « frontière » de pas à pas.
   * @param {Array} notes  explications propres à ce saut (ex. décision du switch)
   * @param {Object} [options] delay : temps de traitement ; onDelivered : remplace device.receive()
   */
  transmit(device, ifaceName, packet, notes = [], { delay = PROCESS_DELAY, onDelivered = null } = {}) {
    const wire = this.peer(device.id, ifaceName);
    if (!wire) {
      this.drop(device, packet, [note('net.unplugged', { name: device.name, iface: ifaceName })]);
      return false;
    }
    const tx = 't' + (++this.txSeq); // identifiant de ce trajet (un même paquet peut être recopié sur plusieurs câbles)
    // Règle métier : une interface n'émet qu'une trame à la fois. Si une trame est déjà en
    // route sur ce câble dans ce sens, la suivante attend qu'elle soit arrivée.
    const port = `${device.id}:${ifaceName}`;
    const departure = Math.max(this.now + delay, (this.busyUntil.get(port) || 0) + PROCESS_DELAY);
    this.busyUntil.set(port, departure + HOP_DURATION);
    const duration = HOP_DURATION;
    this.engine.schedule(departure - this.now, () => {
      this.bus.emit(Topics.PACKET_SEND, {
        tx,
        packet,
        from: device.id,
        to: wire.device.id,
        linkId: wire.linkId,
        time: this.now,
        duration,
        notes: [packet.explain, ...notes].filter(Boolean),
      });
      this.engine.schedule(duration, () => {
        const result = onDelivered
          ? onDelivered(wire.device, wire.iface)
          : wire.device.receive(packet, wire.iface);
        this.bus.emit(Topics.PACKET_RECEIVE, {
          tx,
          packet,
          device: wire.device.id,
          from: device.id,
          linkId: wire.linkId,
          time: this.now,
          accepted: !result || result.accepted !== false,
          notes: (result && result.notes) || [],
        });
      }, { boundary: true });
    });
    return true;
  }

  /** Signale un paquet abandonné, avec la raison. */
  drop(device, packet, notes = []) {
    this.bus.emit(Topics.PACKET_DROP, { packet, device: device.id, time: this.now, notes });
  }

  /** Publie une explication qui n'est liée à aucun paquet en transit. */
  info(device, notes = []) {
    this.bus.emit(Topics.NOTE, { device: device ? device.id : null, time: this.now, notes });
  }

  /** Signale qu'une table ou une adresse d'un équipement a changé. */
  update(device, what) {
    this.bus.emit(Topics.DEVICE_UPDATE, { device: device.id, what, time: this.now });
  }

  /** Minuterie en temps simulé ; retourne un identifiant pour cancel(). */
  after(delay, run) { return this.engine.schedule(delay, run); }
  cancel(id) { return this.engine.cancel(id); }

  /** Lance une action de scénario. */
  runAction(step) {
    if (step.action === 'trace') return this._trace(step);
    const owner = this.registry && this.registry.actionOwner(step.action);
    if (owner) return owner.start(this, step);
    this.info(null, [note('sim.unknownAction', { action: step.action })]);
    return false;
  }

  /**
   * Action intégrée « trace » : un paquet de test suit le chemin donné, saut par saut,
   * sans faire intervenir la logique des équipements. Sert à vérifier l'animation.
   */
  _trace(step) {
    const path = (step.path || []).map((id) => this.devices.get(id));
    if (path.length < 2) return false;
    const first = path[0];
    const last = path[path.length - 1];
    const macOf = (device) => (device.interfaces[0] && device.interfaces[0].mac) || '00:00:00:00:00:00';
    const ipOf = (device) => (device.interfaces[0] && device.interfaces[0].ip) || '0.0.0.0';
    const packet = this.packet({
      protocol: step.protocol || 'ip',
      label: step.label || 'Test',
      eth: { src: macOf(first), dst: macOf(last), type: 'IPv4' },
      ip: { src: ipOf(first), dst: ipOf(last), ttl: 64, proto: 'TEST' },
      data: step.data || 'paquet de test',
    });
    const hop = (index) => {
      if (index >= path.length - 1) {
        this.info(last, [note('trace.arrived', { name: last.name })]);
        return;
      }
      const from = path[index];
      const to = path[index + 1];
      this.transmit(from, this.ifaceToward(from, to), packet,
        [note('trace.hop', { from: from.name, to: to.name })],
        { onDelivered: () => { hop(index + 1); return { accepted: true, notes: [] }; } });
    };
    hop(0);
    return true;
  }
}
