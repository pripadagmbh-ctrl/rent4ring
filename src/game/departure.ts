import * as THREE from 'three';
import type { Approach } from './track';

/**
 * The Rent4Ring yard at Burgstraße 1, and the route the car takes out of it.
 *
 * Geometry and driving line share these numbers on purpose: the yard is built
 * from them in `world.ts` and driven along them in `Game.ts`, so the tarmac and
 * the car can never drift apart.
 *
 * ---------------------------------------------------------------------------
 * Local frame (before the yard is placed into the world):
 *   +z  along the approach road, in the direction of travel
 *   +x  to the driver's left as they come out of the shed — i.e. AWAY from
 *       the road, which lies at x = -(halfWidth + YARD_OFFSET) ≈ -12.1
 *   y   up; the yard floor is YARD_Y, street level is ROAD_Y
 * ---------------------------------------------------------------------------
 *
 * Two hard constraints shaped the layout, both measured from the generated
 * approach data rather than guessed:
 *
 *  1. The road only runs straight to about z = 21 before bending away to -x.
 *     The junction therefore has to sit at z ≈ 21, not further along.
 *  2. The approach world only lays grass out to 40 m either side of the
 *     centreline, and that ground falls 3 m over the span. Anything past
 *     x ≈ 26 would stand over nothing, so the U-turn has to fit inside that.
 */

/** How far the yard sits from the road edge, metres. */
export const YARD_OFFSET = 9;
/** How far back along the road the yard is anchored, metres. */
export const YARD_BACK = 4;
/** The yard floor sits this far below street level. */
export const DIP = 1.9;

/** Top surface of the yard slab, in local coordinates. */
export const YARD_Y = 0.15;
/** Street level, in local coordinates. */
export const ROAD_Y = DIP;

/** The shed: half-extents about the local origin. */
export const SHED = { halfX: 8, halfZ: 5.5, height: 6, front: 5.5 };
/** The roller door the car comes out of. */
export const OPEN_DOOR = { x: 1.4, width: 5.2, height: 4.4 };
/** The roller door that stays shut. */
export const CLOSED_DOOR_X = -4.4;

/** Sunken forecourt. */
export const YARD = { minX: -13, maxX: 11, minZ: -7, maxZ: 14 };
/** The climb from the yard up to street level, driven in +x. */
export const RAMP = { fromX: 11, toX: 19, minZ: 7, maxZ: 16 };
/**
 * The north edge of everything at street level is set by the Burgstraße's
 * *returning* leg, which runs east across the top of the site: in local
 * coordinates its centreline drops from z ≈ 29.7 at x = 1 to z ≈ 24.7 at
 * x = 49, so its near kerb sits at roughly `26.6 - 0.103·x`. Both the turning
 * head and the eastern half of the link lane used to run straight through it —
 * 2,99 m and 2,13 m from the centreline against a 3,1 m half-width, i.e. tarmac
 * laid over a live carriageway. The edges below are cut to clear it.
 */

/** Street-level turning head where the U-turn happens. */
export const PLATEAU = { minX: 19, maxX: 26, minZ: 8, maxZ: 23 };
/**
 * Street-level lane back from the turning head to the junction, in two pieces.
 * One rectangle cannot do both jobs: the junction end needs a wide mouth to
 * meet the road, and the far end has to duck under the returning leg. Cut to
 * the worst case, a single rectangle would have thrown away the mouth.
 */
export const LINK = { minX: -9.5, maxX: 6, minZ: 17.5, maxZ: 25 };
/** The narrower run east of the mouth, held back from the returning leg. */
export const LINK_EAST = { minX: 6, maxX: 20, minZ: 17.5, maxZ: 23 };

/**
 * Where the rest of the fleet is parked: a yard-level apron along the south
 * flank of the ramp. The only sizeable free ground next to the climb — the
 * ramp's other flank is the link lane coming back from the turning head, and
 * the forecourt itself has to stay clear for the car pulling out. Ends at
 * x=21, i.e. 33 m off the road centreline, comfortably inside the 40 m the
 * approach lays ground out to.
 */
export const FLEET_APRON = { minX: 8.5, maxX: 25, minZ: -7, maxZ: 6 };

/**
 * Centre of the parking row, and how far apart the cars stand. The row has
 * to clear the shed's east wall (x = SHED.halfX) — start it any further west
 * and the first cars stand inside the building.
 */
const PARK_Z = 0.5;
const PARK_FIRST_X = 10.2;
const PARK_SPACING = 2.45;

export interface ParkingSpot {
  position: THREE.Vector3;
  yaw: number;
}

/**
 * Parking spots for `count` cars, nose pointing at the forecourt (local +z)
 * so the row faces the driver coming out of the shed.
 */
export function fleetParkingSpots(approach: Approach, count: number): ParkingSpot[] {
  const frame = homeBaseFrame(approach);
  const spots: ParkingSpot[] = [];
  for (let i = 0; i < count; i++) {
    spots.push({
      position: toWorld(frame, PARK_FIRST_X + i * PARK_SPACING, YARD_Y, PARK_Z),
      yaw: frame.yaw,
    });
  }
  return spots;
}

/**
 * Where the camera stands to watch the car come out of the shed, up the ramp
 * and round the U-turn. Two earlier positions were both diagnosed by pixel-
 * sampling the actual render, not just checking clearance:
 *
 *   (6.5, 3.0, 14.0) sat close enough beside the OPEN_DOOR opening (centred
 *   x=1.4, 5.2 m wide) that the sightline to the car grazed the frontage
 *   wall a few metres away — that wall alone filled almost the whole frame.
 *
 *   (3.0, 2.4, 12.0) squared up to the door but was still close enough,
 *   looking almost straight into the (dim) interior, that the surrounding
 *   shed wall dominated the frame at any point along the ramp/U-turn — not
 *   an exposure bug, just a shot with nothing in it but flat wall.
 *
 * Pulled back onto the LEFT side of the yard (x=-9, the side the departure
 * choreography never touches) and further out (z=13.5): a proper 3/4
 * establishing shot of the whole frontage — signage, both doors, sky and
 * yard all in frame — that stays clear through the ramp and U-turn too.
 */
export const CAMERA_ANCHOR = new THREE.Vector3(-9.0, 3.6, 13.5);

/** Approach index the scripted drive hands over at. */
const HANDOVER_INDEX = 6;
/** Which lane the car is left in — negative is the right-hand side. */
const HANDOVER_LATERAL = -1.2;

export interface HomeBaseFrame {
  position: THREE.Vector3;
  yaw: number;
}

/**
 * The whole site stands at a slight angle to the Burgstraße rather than square
 * to it — a yard grown around a building, not laid out on a drawing board.
 *
 * Two things fix both the sign and the size, and both were measured against
 * the generated approach rather than guessed. The site sits inside a hairpin,
 * with the road passing on the near side going out and again on the far side
 * coming back, so there is very little room to turn in:
 *
 *   · the turning head and link lane already reach to 1.27 m of the returning
 *     leg's centreline — inside its 3.1 m half-width. Turning the site the
 *     other way pushes them further in; at 4° they swallow a whole lane.
 *   · the shed's road-side wall stands 4.10 m off the outbound centreline,
 *     i.e. a metre back from the kerb. Turning much past 2° walks it into the
 *     carriageway, and it is 6 m tall.
 *
 * +0.03 rad backs the turning head out to 2.13 m while leaving the shed at
 * 3.57 m — the only direction where the tarmac gets better rather than worse.
 *
 * The turn also has to be about the junction rather than about the local
 * origin. About the origin, the far end of the link lane swings a metre and a
 * half clear of the road it is supposed to join; about the junction that end
 * barely moves and everything else — shed, forecourt, ramp, turning head, the
 * parked fleet, the crowd, the camera — swings behind it.
 */
const TWIST = 0.03;
/**
 * Where the link lane meets the road, in local coordinates. Written out rather
 * than taken from the middle of `LINK`: this is a fixed point on the ground,
 * and deriving it would have quietly moved the whole site the next time the
 * lane's edges were re-cut.
 */
const TWIST_PIVOT = { x: LINK.minX, z: 21.5 };

/**
 * Where the yard sits in the world. Anchored to the very start of the approach
 * so the buildings, the ramp and the driving line all move together if the
 * track data is ever regenerated.
 */
export function homeBaseFrame(approach: Approach): HomeBaseFrame {
  const p = approach.at(0);
  const position = p.pos
    .clone()
    .addScaledVector(p.normal, p.halfWidth + YARD_OFFSET)
    .addScaledVector(p.tangent, -YARD_BACK);
  position.y -= DIP;
  const yaw = Math.atan2(p.tangent.x, p.tangent.z);

  // Rotating the frame alone would spin the site about its origin. Shifting the
  // origin by (P - R(TWIST)·P) cancels that out at the pivot, so the extra yaw
  // reads as a rotation about P instead. Everything downstream of this frame —
  // `toWorld`, the buildings' group transform, the route — inherits it.
  const c = Math.cos(TWIST);
  const s = Math.sin(TWIST);
  const { x, z } = TWIST_PIVOT;
  const shift = { x: x - (x * c + z * s), z: z - (-x * s + z * c) };
  const base: HomeBaseFrame = { position, yaw };
  return { position: toWorld(base, shift.x, 0, shift.z), yaw: yaw + TWIST };
}

/** Local yard coordinates into world space. */
export function toWorld(frame: HomeBaseFrame, x: number, y: number, z: number): THREE.Vector3 {
  const c = Math.cos(frame.yaw);
  const s = Math.sin(frame.yaw);
  return new THREE.Vector3(
    frame.position.x + x * c + z * s,
    frame.position.y + y,
    frame.position.z - x * s + z * c,
  );
}

/**
 * The choreography, as local waypoints: out of the shed, hard left across the
 * yard, up the ramp, a full right-hand U-turn on the turning head, back down
 * the link lane and left at the junction onto the Burgstraße.
 *
 * The U-turn points are a semicircle of radius 5 about (19, 16.5); the rest is
 * straight runs and one 3.5 m left-hander out of the doorway.
 */
const ROUTE: [number, number, number][] = [
  // x, y, z — out of the shed, still on the yard floor
  [OPEN_DOOR.x, YARD_Y, 1.0],
  [OPEN_DOOR.x, YARD_Y, 5.5],
  [OPEN_DOOR.x, YARD_Y, 8.0],
  // the left-hander, radius 3.5 about (4.9, 8.0)
  [2.42, YARD_Y, 10.47],
  [4.9, YARD_Y, 11.5],
  // across the yard to the foot of the ramp
  [8.0, YARD_Y, 11.5],
  [RAMP.fromX, YARD_Y, 11.5],
  // up the ramp
  [15.0, (YARD_Y + ROAD_Y) / 2, 11.5],
  [RAMP.toX, ROAD_Y, 11.5],
  // right-hand U-turn, radius 5 about (19, 16.5)
  [22.54, ROAD_Y, 12.96],
  [24.0, ROAD_Y, 16.5],
  [22.54, ROAD_Y, 20.04],
  [19.0, ROAD_Y, 21.5],
  // back down the link lane towards the road
  [12.0, ROAD_Y, 21.6],
  [4.0, ROAD_Y, 21.5],
  [-3.0, ROAD_Y, 21.4],
  [-7.0, ROAD_Y, 21.3],
  [-11.0, ROAD_Y, 23.5],
];

export interface DepartureRoute {
  curve: THREE.CatmullRomCurve3;
  length: number;
  /** Approach index the car is handed over at. */
  joinIndex: number;
  /** Lateral offset it is handed over at; negative is the right-hand lane. */
  joinLateral: number;
  /** Fixed camera position for the shot of the car leaving the shed. */
  cameraAnchor: THREE.Vector3;
}

/**
 * The full scripted path, ending on the approach road itself. The tail is taken
 * from the real centreline rather than the local frame, because the road curves
 * away from straight after about 20 m — hand-placed points would join it at a
 * visible angle.
 */
export function departureRoute(approach: Approach): DepartureRoute {
  const frame = homeBaseFrame(approach);
  const points = ROUTE.map(([x, y, z]) => toWorld(frame, x, y, z));

  // Join the actual road: swing in towards the centreline, then settle into the
  // right-hand lane along it.
  for (const [index, lateral] of [
    [4, -0.5],
    [HANDOVER_INDEX, HANDOVER_LATERAL],
    [HANDOVER_INDEX + 2, HANDOVER_LATERAL],
  ] as const) {
    const p = approach.at(index);
    points.push(p.pos.clone().addScaledVector(p.normal, lateral));
  }

  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.25);
  return {
    curve,
    length: curve.getLength(),
    joinIndex: HANDOVER_INDEX + 2,
    joinLateral: HANDOVER_LATERAL,
    cameraAnchor: toWorld(frame, CAMERA_ANCHOR.x, CAMERA_ANCHOR.y, CAMERA_ANCHOR.z),
  };
}

/**
 * Target speed in m/s at a given fraction of the route: a crawl out of the
 * shed, brisker up the ramp, careful round the U-turn, then building up along
 * the link lane so the driver takes over with the car already rolling.
 */
export function departureSpeedAt(u: number): number {
  if (u < 0.06) return 3.0; // easing out of the doorway
  if (u < 0.16) return 4.5; // the left-hander across the yard
  if (u < 0.26) return 6.5; // up the ramp
  if (u < 0.42) return 4.8; // round the U-turn
  if (u < 0.72) return 10.0; // down the link lane
  if (u < 0.88) return 6.5; // slowing for the junction
  return 11.0; // out onto the Burgstraße
}
