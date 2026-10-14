// Plain numbers for each packaging shape (no three.js), shared by the 3D shapes and the photo tools.
// height: full height in scene units. bandR / bandH: label band radius and height.
// labelY: the label band's [bottom, top] in shape units (null = don't unroll photos onto this shape).
export const SHAPE_SPECS = {
  bottle: { height: 1.3, bandR: 0.323, bandH: 0.78, labelY: [-0.52, 0.26] },
  dropper: { height: 1.2, bandR: 0.273, bandH: 0.56, labelY: [-0.5, 0.06] },
  jar: { height: 0.8, bandR: 0.463, bandH: 0.36, labelY: [-0.32, 0.09] },
  tube: { height: 1.4, bandR: 0.27, bandH: 1.008, labelY: null }, // flattened end doesn't unroll like a cylinder
  can: { height: 1.22, bandR: 0.332, bandH: 1.03, labelY: [-0.54, 0.49] },
  tub: { height: 0.95, bandR: 0.443, bandH: 0.5, labelY: [-0.36, 0.14] },
  photo: { height: 1.2, bandR: 0.3, bandH: 0.6, labelY: null },
}
export const specFor = name => SHAPE_SPECS[name] ?? SHAPE_SPECS.bottle
