// Comportement d'un routeur : il relie plusieurs réseaux IP et relaie les paquets
// d'une interface à l'autre.
//
// Version simple (S3) : le routeur ne connaît que les réseaux auxquels il est directement
// branché, plus une éventuelle passerelle par défaut. Le TTL n'est pas encore géré.

import { IpNode, texts as hostTexts } from './host.js';
import { note } from '../events.js';

export const texts = {
  ...hostTexts,
  'router.lookup': {
    fr: '{name} consulte sa table de routage : {dst} appartient à {network}/{prefix}, sortie par {iface} ({how}).',
    en: '{name} looks up its routing table: {dst} belongs to {network}/{prefix}, exit through {iface} ({how}).',
  },
  'router.forward': {
    fr: '{name} relaie le paquet : nouvelles adresses MAC (source {srcMac}, destination {dstMac}), adresses IP inchangées.',
    en: '{name} forwards the packet: new MAC addresses (source {srcMac}, destination {dstMac}), IP addresses unchanged.',
  },
  'router.noRoute': {
    fr: '{name} n\'a aucune route vers {dst} : le paquet est détruit.',
    en: '{name} has no route to {dst}: the packet is discarded.',
  },
};

export class Router extends IpNode {
  constructor(def, net) {
    super(def, net);
    this.forwarding = true;
  }

  /** Relaie un paquet IP qui ne nous est pas destiné. */
  forward(packet, inIface) {
    const dst = packet.ip.dst;
    const hop = this.lookup(dst);
    if (!hop) {
      this.net.drop(this, packet, [note('router.noRoute', { name: this.name, dst })]);
      const icmp = this.net.registry.get('icmp');
      if (icmp && icmp.error) icmp.error(this, packet, 'net', inIface);
      return { accepted: true, notes: [note('router.noRoute', { name: this.name, dst })] };
    }
    const how = hop.route.via
      ? { fr: `prochain saut ${hop.route.via}`, en: `next hop ${hop.route.via}` }
      : { fr: 'réseau directement connecté', en: 'directly connected network' };
    const lookup = note('router.lookup', {
      name: this.name, dst, network: hop.route.network, prefix: hop.route.prefix, iface: hop.iface.name, how,
    });
    const ttl = packet.ip.ttl;
    const notes = [];
    this.output(
      hop,
      (mac) => this.net.clone(packet, { eth: { src: hop.iface.mac, dst: mac, type: 'IPv4' }, ip: { ttl } }),
      (mac) => [lookup, ...notes, note('router.forward', { name: this.name, srcMac: hop.iface.mac, dstMac: mac })],
    );
    return { accepted: true, notes: [lookup] };
  }

  tables() {
    return [
      {
        id: 'routes',
        title: { fr: 'Table de routage', en: 'Routing table' },
        columns: [{ fr: 'Réseau', en: 'Network' }, { fr: 'Prochain saut', en: 'Next hop' }, { fr: 'Interface', en: 'Interface' }],
        rows: this.routeRows(),
      },
      ...super.tables(),
    ];
  }
}

export function create(def, net) {
  return new Router(def, net);
}
