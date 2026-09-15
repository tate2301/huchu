/**
 * FloorCode Zimbabwe's site-visit question bank.
 *
 * Generated from `docs/client/FloorCode_Zimbabwe_Site_Visit_Question_Bank (1).docx`
 * by `scripts/crm/question-bank-sync.py`. Every `label` is the client's
 * question verbatim — the generator maps, it does not paraphrase. Re-run the
 * script if the client sends a revised bank; do not hand-edit the labels.
 *
 * What IS inferred is each question's `type`, since the .docx is a paper
 * checklist and states a type only where it lists options ("Indoor / Outdoor /
 * Entrance recess") or ends "Yes / No". Questions where the inference is a
 * judgement call carry `needsReview` so somebody can correct them in settings.
 * Correcting one is a data edit against the tenant's own question set, not a
 * change to this file.
 *
 * This is a TEMPLATE, not live configuration. It seeds a tenant's question
 * sets once, the way DEFAULT_STAGE_TEMPLATE seeds a pipeline; from then on the
 * tenant's rows are the source of truth and this file no longer speaks for
 * them.
 */

export type SiteVisitQuestionType =
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "BOOLEAN"
  | "SINGLE_SELECT"
  | "MULTI_SELECT"
  | "DATE"
  | "DIMENSION"
  | "PHOTO_EVIDENCE";

/**
 * PRODUCT  one section per thing FloorCode sells; attached to a `Product`.
 * EVIDENCE the photo checklist every visit carries regardless of product.
 * CLOSEOUT the rep's sign-off gate at the end of the visit.
 */
export type SiteVisitSectionKind = "product" | "evidence" | "closeout";

export type SiteVisitQuestionTemplate = {
  key: string;
  label: string;
  type: SiteVisitQuestionType;
  options?: string[];
  /** The type is a guess worth a human's eye. Never blocks capture. */
  needsReview?: boolean;
};

export type SiteVisitSectionTemplate = {
  key: string;
  name: string;
  kind: SiteVisitSectionKind;
  questions: SiteVisitQuestionTemplate[];
  /** The "Capture:" / "Critical:" lines the bank states for this section. */
  photoGuidance?: string[];
};

export const FLOORCODE_QUESTION_BANK: SiteVisitSectionTemplate[] = [
  {
    key: "branded_mats_custom_logo_mats",
    name: "1. BRANDED MATS / CUSTOM LOGO MATS",
    kind: "product",
    questions: [
      {
        key: "size_mat_is_required",
        label: "What size mat is required? ___ m × ___ m",
        type: "DIMENSION",
      },
      {
        key: "will_the_mat_be_installed",
        label: "Where will the mat be installed? Indoor / Outdoor / Entrance recess",
        type: "SINGLE_SELECT",
        options: ["Indoor", "Outdoor", "Entrance recess"],
      },
      {
        key: "the_client_require_a_logo_design",
        label: "Does the client require a logo/design? Yes / No",
        type: "BOOLEAN",
      },
      {
        key: "the_artwork_available",
        label: "Is the artwork available? Yes / No",
        type: "BOOLEAN",
      },
    ],
    photoGuidance: ["Capture: logo/artwork, entrance photographs, dimensions and recess details where applicable."],
  },
  {
    key: "rubber_mats",
    name: "2. RUBBER MATS",
    kind: "product",
    questions: [
      {
        key: "area_application_is_the_mat_for",
        label: "What area/application is the mat for?",
        type: "SHORT_TEXT",
      },
      {
        key: "dimensions_are_required",
        label: "What dimensions are required?",
        type: "SHORT_TEXT",
      },
      {
        key: "thickness_is_required_if_specified",
        label: "What thickness is required, if specified?",
        type: "SHORT_TEXT",
      },
      {
        key: "indoor_or_outdoor",
        label: "Indoor or outdoor?",
        type: "SINGLE_SELECT",
        options: ["Indoor", "Outdoor"],
      },
      {
        key: "it_be_exposed_to_water_oil",
        label: "Will it be exposed to water, oil, chemicals or heavy loads?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "the_client_require_drainage_holes",
        label: "Does the client require drainage holes?",
        type: "BOOLEAN",
      },
      {
        key: "the_client_require_supply_only_or",
        label: "Does the client require supply only or installation?",
        type: "SINGLE_SELECT",
        options: ["Supply only", "Installation"],
      },
    ],
  },
  {
    key: "vinyl_loop_mats",
    name: "3. VINYL LOOP MATS",
    kind: "product",
    questions: [
      {
        key: "dimensions_are_required",
        label: "What dimensions are required?",
        type: "SHORT_TEXT",
      },
      {
        key: "will_the_mat_be_installed",
        label: "Where will the mat be installed?",
        type: "SHORT_TEXT",
      },
      {
        key: "it_a_recessed_mat_or_surface",
        label: "Is it a recessed mat or surface-laid mat?",
        type: "SINGLE_SELECT",
        options: ["A recessed mat", "Surface-laid mat"],
      },
      {
        key: "is_the_expected_traffic_level",
        label: "What is the expected traffic level?",
        type: "SHORT_TEXT",
      },
      {
        key: "branding_required",
        label: "Is branding required?",
        type: "BOOLEAN",
      },
      {
        key: "the_client_require_edging_finishing",
        label: "Does the client require edging/finishing?",
        type: "BOOLEAN",
      },
      {
        key: "supply_only_or_supply_installation",
        label: "Supply only or supply & installation?",
        type: "SINGLE_SELECT",
        options: ["Supply only", "Supply & installation"],
      },
    ],
  },
  {
    key: "cushion_fall_mats",
    name: "4. CUSHION FALL MATS",
    kind: "product",
    questions: [
      {
        key: "is_the_application",
        label: "What is the application?",
        type: "SHORT_TEXT",
      },
      {
        key: "is_the_total_area",
        label: "What is the total area?",
        type: "NUMBER",
      },
      {
        key: "is_the_maximum_fall_height",
        label: "What is the maximum fall height?",
        type: "SHORT_TEXT",
      },
      {
        key: "equipment_structures_are_located_within_the",
        label: "What equipment/structures are located within the area?",
        type: "SHORT_TEXT",
      },
      {
        key: "is_the_existing_substrate",
        label: "What is the existing substrate?",
        type: "SHORT_TEXT",
      },
      {
        key: "the_substrate_suitable_for_installation_or",
        label: "Is the substrate suitable for installation or does it require preparation?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "drainage_adequate",
        label: "Is drainage adequate?",
        type: "BOOLEAN",
      },
      {
        key: "thickness_is_required_specification_provided",
        label: "What thickness is required/specification provided?",
        type: "SHORT_TEXT",
      },
      {
        key: "there_different_colours_designs_required",
        label: "Are there different colours/designs required?",
        type: "BOOLEAN",
      },
      {
        key: "there_edges_kerbs_or_other_perimeter",
        label: "Are there edges, kerbs or other perimeter conditions?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "the_client_require_supply_only_or",
        label: "Does the client require supply only or full installation?",
        type: "SINGLE_SELECT",
        options: ["Supply only", "Full installation"],
      },
      {
        key: "removal_preparation_of_the_existing_surface",
        label: "Is removal/preparation of the existing surface required?",
        type: "BOOLEAN",
      },
    ],
    photoGuidance: ["Critical: measure the fall height accurately and photograph the existing surface and equipment."],
  },
  {
    key: "berber_point_mats",
    name: "5. BERBER POINT MATS",
    kind: "product",
    questions: [
      {
        key: "are_the_required_dimensions",
        label: "What are the required dimensions?",
        type: "SHORT_TEXT",
      },
      {
        key: "will_the_mat_be_installed",
        label: "Where will the mat be installed?",
        type: "SHORT_TEXT",
      },
      {
        key: "there_an_existing_mat_recess",
        label: "Is there an existing mat recess?",
        type: "BOOLEAN",
      },
      {
        key: "the_client_require_branding",
        label: "Does the client require branding?",
        type: "BOOLEAN",
      },
      {
        key: "is_the_approximate_traffic_level",
        label: "What is the approximate traffic level?",
        type: "SHORT_TEXT",
      },
      {
        key: "the_client_require_supply_only_or",
        label: "Does the client require supply only or installation?",
        type: "SINGLE_SELECT",
        options: ["Supply only", "Installation"],
      },
    ],
    photoGuidance: ["Capture: recess depth and door clearance where applicable."],
  },
  {
    key: "grime_buster_mats",
    name: "6. GRIME BUSTER MATS",
    kind: "product",
    questions: [
      {
        key: "dimensions_are_required",
        label: "What dimensions are required?",
        type: "SHORT_TEXT",
      },
      {
        key: "will_the_mat_be_installed",
        label: "Where will the mat be installed?",
        type: "SHORT_TEXT",
      },
      {
        key: "it_intended_primarily_for_dirt_moisture",
        label: "Is it intended primarily for dirt, moisture or both?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "level_of_traffic_will_it_receive",
        label: "What level of traffic will it receive?",
        type: "SHORT_TEXT",
      },
      {
        key: "indoor_outdoor_or_entrance_transition",
        label: "Indoor, outdoor or entrance transition?",
        type: "SHORT_TEXT",
      },
      {
        key: "there_an_existing_mat_recess",
        label: "Is there an existing mat recess?",
        type: "BOOLEAN",
      },
      {
        key: "the_client_require_branding",
        label: "Does the client require branding?",
        type: "BOOLEAN",
      },
      {
        key: "supply_only_or_supply_installation",
        label: "Supply only or supply & installation?",
        type: "SINGLE_SELECT",
        options: ["Supply only", "Supply & installation"],
      },
    ],
  },
  {
    key: "rubber_flooring",
    name: "7. RUBBER FLOORING",
    kind: "product",
    questions: [
      {
        key: "is_the_total_floor_area",
        label: "What is the total floor area?",
        type: "NUMBER",
      },
      {
        key: "is_the_space_used_for",
        label: "What is the space used for?",
        type: "SHORT_TEXT",
      },
      {
        key: "level_of_traffic_load_will_the",
        label: "What level of traffic/load will the floor receive?",
        type: "SHORT_TEXT",
      },
      {
        key: "there_be_gym_equipment_machinery_trolleys",
        label: "Will there be gym equipment, machinery, trolleys, forklifts or vehicles?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "is_the_existing_floor_finish",
        label: "What is the existing floor finish?",
        type: "SHORT_TEXT",
      },
      {
        key: "condition_is_it_in",
        label: "What condition is it in?",
        type: "SHORT_TEXT",
      },
      {
        key: "there_cracks_holes_damaged_areas_or",
        label: "Are there cracks, holes, damaged areas or uneven sections?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "the_existing_flooring_need_to_be",
        label: "Does the existing flooring need to be removed?",
        type: "BOOLEAN",
      },
      {
        key: "there_evidence_of_moisture_damp",
        label: "Is there evidence of moisture/damp?",
        type: "BOOLEAN",
      },
      {
        key: "thickness_is_required",
        label: "What thickness is required?",
        type: "SHORT_TEXT",
      },
      {
        key: "colour_is_required",
        label: "What colour is required?",
        type: "SHORT_TEXT",
      },
      {
        key: "a_particular_rubber_flooring_specification_product",
        label: "Is a particular rubber flooring specification/product required?",
        type: "BOOLEAN",
      },
      {
        key: "different_colours_patterns_required",
        label: "Are different colours/patterns required?",
        type: "BOOLEAN",
      },
      {
        key: "the_client_require_supply_only_or",
        label: "Does the client require supply only or supply & installation?",
        type: "SINGLE_SELECT",
        options: ["Supply only", "Supply & installation"],
      },
      {
        key: "there_skirtings_ramps_thresholds_or_other",
        label: "Are there skirtings, ramps, thresholds or other finishing requirements?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "the_area_be_cleared_before_installation",
        label: "Can the area be cleared before installation?",
        type: "BOOLEAN",
      },
      {
        key: "when_must_the_work_be_completed",
        label: "When must the work be completed?",
        type: "DATE",
      },
    ],
    photoGuidance: ["Capture: full floor measurements and clear photographs of the substrate and defects."],
  },
  {
    key: "epoxy_flooring",
    name: "8. EPOXY FLOORING",
    kind: "product",
    questions: [
      {
        key: "is_the_total_floor_area",
        label: "What is the total floor area?",
        type: "NUMBER",
      },
      {
        key: "all_areas_receiving_the_same_epoxy",
        label: "Are all areas receiving the same epoxy system?",
        type: "BOOLEAN",
      },
      {
        key: "walls_skirtings_or_coves_also_required",
        label: "Are walls, skirtings or coves also required?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "is_the_area_used_for",
        label: "What is the area used for?",
        type: "NUMBER",
      },
      {
        key: "type_of_traffic_will_it_receive",
        label: "What type of traffic will it receive?",
        type: "SHORT_TEXT",
      },
      {
        key: "forklifts_pallet_jacks_vehicles_or_heavy",
        label: "Will forklifts, pallet jacks, vehicles or heavy machinery operate on it?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "there_heavy_point_loads",
        label: "Are there heavy point loads?",
        type: "BOOLEAN",
      },
      {
        key: "the_floor_be_exposed_to_water",
        label: "Will the floor be exposed to water or frequent washing?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "it_be_exposed_to_oil_chemicals",
        label: "Will it be exposed to oil, chemicals, solvents, acids or other aggressive substances?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "there_exposure_to_high_temperatures_or",
        label: "Is there exposure to high temperatures or steam?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "it_a_food_pharmaceutical_or_healthcare",
        label: "Is it a food, pharmaceutical or healthcare environment requiring a specific hygienic/food-grade system?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "is_the_existing_substrate",
        label: "What is the existing substrate?",
        type: "SHORT_TEXT",
      },
      {
        key: "old_is_it_if_known",
        label: "How old is it, if known?",
        type: "SHORT_TEXT",
      },
      {
        key: "it_structurally_sound",
        label: "Is it structurally sound?",
        type: "BOOLEAN",
      },
      {
        key: "there_cracks",
        label: "Are there cracks?",
        type: "BOOLEAN",
      },
      {
        key: "there_potholes_or_damaged_areas",
        label: "Are there potholes or damaged areas?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "there_existing_paint_coating_epoxy",
        label: "Is there existing paint/coating/epoxy?",
        type: "BOOLEAN",
      },
      {
        key: "there_oil_grease_or_chemical_contamination",
        label: "Is there oil, grease or chemical contamination?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "there_visible_moisture_damp",
        label: "Is there visible moisture/damp?",
        type: "BOOLEAN",
      },
      {
        key: "the_floor_level",
        label: "Is the floor level?",
        type: "BOOLEAN",
      },
      {
        key: "there_existing_expansion_construction_joints",
        label: "Are there existing expansion/construction joints?",
        type: "BOOLEAN",
      },
      {
        key: "level_of_preparation_is_required",
        label: "What level of preparation is required?",
        type: "SHORT_TEXT",
      },
      {
        key: "grinding_scarification_or_shot_blasting_be",
        label: "Will grinding, scarification or shot blasting be required?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "repairs_or_patching_required",
        label: "Are repairs or patching required?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "levelling_required",
        label: "Is levelling required?",
        type: "BOOLEAN",
      },
      {
        key: "the_floor_require_a_screed_self",
        label: "Does the floor require a screed/self-levelling layer before epoxy?",
        type: "BOOLEAN",
      },
      {
        key: "finish_does_the_client_require",
        label: "What finish does the client require? Standard / Heavy-duty / Self-levelling / Non-slip / Decorative / Chemical-resistant / Food-grade",
        type: "SINGLE_SELECT",
        options: ["Standard", "Heavy-duty", "Self-levelling", "Non-slip", "Decorative", "Chemical-resistant", "Food-grade"],
      },
      {
        key: "thickness_is_required_specification",
        label: "What thickness is required/specification?",
        type: "SHORT_TEXT",
      },
      {
        key: "colour_is_required",
        label: "What colour is required?",
        type: "SHORT_TEXT",
      },
      {
        key: "line_marking_required",
        label: "Is line marking required?",
        type: "BOOLEAN",
      },
      {
        key: "coves_skirtings_required",
        label: "Are coves/skirtings required?",
        type: "BOOLEAN",
      },
      {
        key: "drainage_channels_involved",
        label: "Are drainage channels involved?",
        type: "BOOLEAN",
      },
      {
        key: "long_can_the_area_be_taken",
        label: "How long can the area be taken out of service?",
        type: "SHORT_TEXT",
      },
      {
        key: "there_production_operational_restrictions",
        label: "Are there production/operational restrictions?",
        type: "BOOLEAN",
      },
      {
        key: "when_must_the_floor_be_ready",
        label: "When must the floor be ready for use?",
        type: "DATE",
      },
    ],
    photoGuidance: ["Critical: photograph cracks, damaged areas, joints, contamination and moisture-related conditions."],
  },
  {
    key: "tile_installation",
    name: "9. TILE INSTALLATION",
    kind: "product",
    questions: [
      {
        key: "is_the_total_area_to_be",
        label: "What is the total area to be tiled?",
        type: "NUMBER",
      },
      {
        key: "it_floor_wall_or_both",
        label: "Is it floor, wall or both?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "tile_is_being_used",
        label: "What tile is being used?",
        type: "SHORT_TEXT",
      },
      {
        key: "are_the_tile_dimensions",
        label: "What are the tile dimensions?",
        type: "SHORT_TEXT",
      },
      {
        key: "the_client_already_purchased_the_tiles",
        label: "Has the client already purchased the tiles?",
        type: "BOOLEAN",
      },
      {
        key: "supplies_the_adhesive_grout_and_ancillary",
        label: "Who supplies the adhesive, grout and ancillary materials?",
        type: "SHORT_TEXT",
      },
      {
        key: "is_the_existing_surface",
        label: "What is the existing surface?",
        type: "SHORT_TEXT",
      },
      {
        key: "the_existing_surface_require_removal",
        label: "Does the existing surface require removal?",
        type: "BOOLEAN",
      },
      {
        key: "the_substrate_require_levelling_or_repair",
        label: "Does the substrate require levelling or repair?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "there_stairs_skirtings_drains_thresholds_or",
        label: "Are there stairs, skirtings, drains, thresholds or unusual areas?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "grout_colour_joint_size_is_required",
        label: "What grout colour/joint size is required?",
        type: "SHORT_TEXT",
      },
      {
        key: "waterproofing_required",
        label: "Is waterproofing required?",
        type: "BOOLEAN",
      },
      {
        key: "supply_installation_or_installation_only",
        label: "Supply & installation or installation only?",
        type: "SINGLE_SELECT",
        options: ["Supply & installation", "Installation only"],
      },
      {
        key: "is_the_required_completion_date",
        label: "What is the required completion date?",
        type: "SHORT_TEXT",
      },
    ],
  },
  {
    key: "artificial_grass",
    name: "10. ARTIFICIAL GRASS",
    kind: "product",
    questions: [
      {
        key: "is_the_total_area",
        label: "What is the total area?",
        type: "NUMBER",
      },
      {
        key: "is_the_intended_use",
        label: "What is the intended use?",
        type: "SHORT_TEXT",
      },
      {
        key: "is_the_existing_surface",
        label: "What is the existing surface?",
        type: "SHORT_TEXT",
      },
      {
        key: "the_area_level",
        label: "Is the area level?",
        type: "BOOLEAN",
      },
      {
        key: "drainage_adequate",
        label: "Is drainage adequate?",
        type: "BOOLEAN",
      },
      {
        key: "existing_grass_soil_or_paving_need",
        label: "Does existing grass, soil or paving need removal?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "the_ground_require_excavation_and_preparation",
        label: "Does the ground require excavation and preparation?",
        type: "BOOLEAN",
      },
      {
        key: "it_require_a_compacted_sub_base",
        label: "Does it require a compacted sub-base?",
        type: "BOOLEAN",
      },
      {
        key: "turf_height_is_required",
        label: "What turf height is required? 15 / 20 / 25 / 30 / 40 mm",
        type: "SINGLE_SELECT",
        options: ["15", "20", "25", "30", "40"],
      },
      {
        key: "there_curves_trees_posts_drains_or",
        label: "Are there curves, trees, posts, drains or other obstacles?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "perimeter_edges_kerbs_required",
        label: "Are perimeter edges/kerbs required?",
        type: "BOOLEAN",
      },
      {
        key: "infill_required",
        label: "Is infill required?",
        type: "BOOLEAN",
      },
      {
        key: "supply_only_or_supply_installation",
        label: "Supply only or supply & installation?",
        type: "SINGLE_SELECT",
        options: ["Supply only", "Supply & installation"],
      },
      {
        key: "the_client_expecting_a_landscape_finish",
        label: "Is the client expecting a landscape finish or sports/play-grade installation?",
        type: "BOOLEAN",
        needsReview: true,
      },
    ],
  },
  {
    key: "wall_cladding",
    name: "11. WALL CLADDING",
    kind: "product",
    questions: [
      {
        key: "is_the_total_wall_area",
        label: "What is the total wall area?",
        type: "NUMBER",
      },
      {
        key: "it_internal_or_external",
        label: "Is it internal or external?",
        type: "SINGLE_SELECT",
        options: ["Internal", "External"],
      },
      {
        key: "is_the_existing_wall_surface",
        label: "What is the existing wall surface?",
        type: "SHORT_TEXT",
      },
      {
        key: "the_wall_sound_dry_and_suitable",
        label: "Is the wall sound, dry and suitable for fixing?",
        type: "BOOLEAN",
      },
      {
        key: "cladding_product_type_is_required",
        label: "What cladding product/type is required?",
        type: "SHORT_TEXT",
      },
      {
        key: "colour_design_finish_is_required",
        label: "What colour/design/finish is required?",
        type: "SHORT_TEXT",
      },
      {
        key: "there_windows_doors_corners_columns_or",
        label: "Are there windows, doors, corners, columns or other penetrations?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "trims_corner_profiles_required",
        label: "Are trims/corner profiles required?",
        type: "BOOLEAN",
      },
      {
        key: "existing_cladding_finish_need_to_be",
        label: "Does existing cladding/finish need to be removed?",
        type: "BOOLEAN",
      },
      {
        key: "access_is_available",
        label: "What access is available?",
        type: "SHORT_TEXT",
      },
      {
        key: "scaffolding_or_a_mewp_be_required",
        label: "Will scaffolding or a MEWP be required?",
        type: "BOOLEAN",
        needsReview: true,
      },
      {
        key: "the_client_require_supply_only_or",
        label: "Does the client require supply only or supply & installation?",
        type: "SINGLE_SELECT",
        options: ["Supply only", "Supply & installation"],
      },
    ],
  },
  {
    key: "standard_site_evidence",
    name: "STANDARD SITE EVIDENCE",
    kind: "evidence",
    questions: [
      {
        key: "site_area_overview_photographs",
        label: "Site/area overview photographs",
        type: "PHOTO_EVIDENCE",
      },
      {
        key: "measurement_photographs_where_useful",
        label: "Measurement photographs where useful",
        type: "PHOTO_EVIDENCE",
      },
      {
        key: "existing_substrate_surface_photographs",
        label: "Existing substrate/surface photographs",
        type: "PHOTO_EVIDENCE",
      },
      {
        key: "defects_damage_or_problem_areas",
        label: "Defects, damage or problem areas",
        type: "PHOTO_EVIDENCE",
      },
      {
        key: "access_and_material_delivery_route",
        label: "Access and material delivery route",
        type: "PHOTO_EVIDENCE",
      },
      {
        key: "obstacles_doors_thresholds_drains_and_service",
        label: "Obstacles, doors, thresholds, drains and service penetrations",
        type: "PHOTO_EVIDENCE",
      },
      {
        key: "relevant_drawings_specifications_supplied_by_client",
        label: "Relevant drawings/specifications supplied by client",
        type: "PHOTO_EVIDENCE",
      },
      {
        key: "product_artwork_designs_where_applicable",
        label: "Product artwork/designs where applicable",
        type: "PHOTO_EVIDENCE",
      },
    ],
  },
  {
    key: "site_visit_close_out",
    name: "SITE VISIT CLOSE-OUT",
    kind: "closeout",
    questions: [
      {
        key: "client_requirement_clearly_understood",
        label: "Client requirement clearly understood",
        type: "BOOLEAN",
      },
      {
        key: "measurements_completed",
        label: "Measurements completed",
        type: "BOOLEAN",
      },
      {
        key: "photos_captured",
        label: "Photos captured",
        type: "BOOLEAN",
      },
      {
        key: "technical_risks_identified",
        label: "Technical risks identified",
        type: "BOOLEAN",
      },
      {
        key: "specification_confirmed",
        label: "Specification confirmed",
        type: "BOOLEAN",
      },
      {
        key: "quotation_can_be_prepared_from_site",
        label: "Quotation can be prepared from site information",
        type: "BOOLEAN",
      },
      {
        key: "additional_information_required",
        label: "Additional information required",
        type: "LONG_TEXT",
      },
      {
        key: "next_action",
        label: "Next action",
        type: "LONG_TEXT",
      },
    ],
  },
];
