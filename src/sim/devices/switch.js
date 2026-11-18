// Comportement d'un switch (commutateur Ethernet).
//
// Le switch ne regarde que les adresses MAC :
//   1. apprentissage — il note sur quel port se trouve l'adresse MAC source de chaque trame ;
//   2. commutation — si la destination est connue, la trame ne sort que par le bon port ;
//   3. inondation — destination inconnue ou diffusion : la trame sort par tous les ports,
//      sauf celui d'arrivée.
//
// Simplifications pédagogiques : pas de VLAN, pas de Spanning Tree, les entrées de la
// table n'expirent pas.

import { Device } from '../network.js';
import { note } from '../events.js';
import { isGroupMac } from '../addr.js';

export const texts = {
  'switch.learn': {
    fr: '{name} apprend que {mac} se trouve derrière son port {port} et l\'inscrit dans sa table MAC.',
    en: '{name} learns that {mac} sits behind its port {port} and writes it into its MAC table.',
  },
  'switch.flood.broadcast': {
    fr: '{name} : la trame est une diffusion ({dst}). Il la recopie sur tous ses ports sauf celui d\'arrivée ({port}).',
    en: '{name}: the frame is a broadcast ({dst}). It copies it to every port except the one it came from ({port}).',
  },
  'switch.flood.unknown': {
    fr: '{name} ne connaît pas encore {dst} : faute de mieux, il envoie la trame sur tous ses ports sauf {port}.',
    en: '{name} does not know {dst} yet: for lack of better, it sends the frame out of every port except {port}.',
  },
  'switch.forward': {
    fr: '{name} trouve {dst} dans sa table MAC : la trame sort uniquement par le port {out}.',
    en: '{name} finds {dst} in its MAC table: the frame leaves through port {out} only.',
  },
  'switch.filter': {
    fr: '{name} : {dst} se trouve sur le port d\'arrivée, la trame n\'a pas besoin d\'être relayée.',
    en: '{name}: {dst} lives on the incoming port, the frame does not need forwarding.',
  },
};

export class Switch extends Device {
  constructor(def, net) {
    super(def, net);
    this.macTable = new Map(); // adresse MAC -> nom du port
  }

  receive(packet, port) {
    const notes = [];
    const { src, dst } = packet.eth;

    // 1. Apprentissage de l'adresse source.
    if (this.macTable.get(src) !== port) {
      this.macTable.set(src, port);
      this.net.update(this, 'mac');
      notes.push(note('switch.learn', { name: this.name, mac: src, port }));
    }

    // 2. Décision de sortie.
    const known = this.macTable.get(dst);
    if (isGroupMac(dst) || !known) {
      const key = isGroupMac(dst) ? 'switch.flood.broadcast' : 'switch.flood.unknown';
      const decision = note(key, { name: this.name, dst, port });
      notes.push(decision);
      for (const iface of this.interfaces) {
        if (iface.name !== port && this.net.peer(this.id, iface.name)) {
          this.net.transmit(this, iface.name, packet, [decision]);
        }
      }
    } else if (known === port) {
      notes.push(note('switch.filter', { name: this.name, dst }));
    } else {
      const decision = note('switch.forward', { name: this.name, dst, out: known });
      notes.push(decision);
      this.net.transmit(this, known, packet, [decision]);
    }
    return { accepted: true, notes };
  }

  tables() {
    return [{
      id: 'mac',
      title: { fr: 'Table MAC', en: 'MAC table' },
      columns: [{ fr: 'Adresse MAC', en: 'MAC address' }, { fr: 'Port', en: 'Port' }],
      rows: [...this.macTable.entries()],
    }];
  }
}

export function create(def, net) {
  return new Switch(def, net);
}
