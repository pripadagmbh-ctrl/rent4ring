import type { Car } from '../data/fleet';
import { buildCarMesh, type CarMesh } from './carMesh';
import { buildDucatiPanigale } from './ducati';

/**
 * One entry point for "give me a mesh for this vehicle".
 *
 * The choice does not live inside buildCarMesh because ducati.ts already
 * imports loft() and curve() from carMesh.ts, and having carMesh import the
 * bike back would close an import cycle. A small module above both keeps the
 * dependency one-way, and the callers do not care which shape comes out —
 * BikeMesh satisfies the CarMesh contract.
 */
export function buildVehicleMesh(car: Car, options: { ghost?: boolean } = {}): CarMesh {
  if (car.bike) return buildDucatiPanigale({ rider: true, ghost: options.ghost, paint: car.color });
  return buildCarMesh(car, options);
}
