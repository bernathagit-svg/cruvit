/** Auto-generated structural migration data. Do not hand-edit — re-run scripts/_derive-bootstrap-safe-climate-migration.mjs */
export const BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1 = {
  "migrationId": "bootstrap-safe-climate-traits-v1",
  "version": "1.0.0",
  "generatedFrom": "app.html SMART_REC groups/assignments/specific + PLANT_LIBRARY identity",
  "note": "Structural migration only. Values are LEGACY_ASSERTED_METADATA. No SOURCE_SUPPORTED invented. No flowering/fruiting fabricated beyond explicit legacy text.",
  "safeCount": 26,
  "conflictCount": 26,
  "safeSlugs": [
    "aloe-vera",
    "apricot",
    "avocado",
    "basil",
    "black-eyed-susan-vine",
    "cycas",
    "cyclamen",
    "date-palm",
    "ficus-benjamina",
    "guava",
    "hibiscus",
    "hydrangea",
    "lavender",
    "lemon",
    "lychee",
    "mandarin",
    "mango",
    "monstera",
    "olive",
    "orange",
    "pomegranate",
    "queen-palm",
    "raspberry",
    "rosemary",
    "strawberry-guava",
    "strelitzia"
  ],
  "conflictSlugs": [
    "agapanthus",
    "apple",
    "apple-tree",
    "azalea",
    "banana",
    "blueberry",
    "bougainvillea",
    "camellia",
    "fig",
    "fig-tree",
    "geranium",
    "grape-vine",
    "grapevine",
    "jasmine",
    "melaleuca",
    "mint",
    "mulberry",
    "passion-fruit",
    "passionfruit",
    "peach",
    "peach-tree",
    "pear",
    "pear-tree",
    "plum",
    "plum-tree",
    "succulent"
  ],
  "plants": {
    "lavender": {
      "slug": "lavender",
      "name": "Lavender",
      "scientific": "Lavandula angustifolia",
      "aliases": [
        "lavender",
        "lavandula",
        "lavandula angustifolia",
        "לבנדר",
        "אזוביון"
      ],
      "climateTraits": {
        "frostSensitivity": "low",
        "coldTolerance": "medium",
        "heatTolerance": "medium",
        "humidityTolerance": "low",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun",
        "waterNeeds": "low",
        "floweringRequirements": "Needs strong sun, lean drainage, and low humidity for best flowering.",
        "survivalVsThriveNotes": "Can survive more places than it thrives. Hot-humid conditions and wet roots quickly reduce quality.",
        "hardBlockRules": [
          "humid-heat-stress"
        ],
        "groupIds": [
          "humid-sensitive-mediterranean"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "hardBlockRules": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "humid-sensitive-mediterranean"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "lemon": {
      "slug": "lemon",
      "name": "Lemon Tree",
      "scientific": "Citrus × limon",
      "aliases": [
        "lemon",
        "lemon tree",
        "citrus limon",
        "לימון",
        "עץ לימון"
      ],
      "climateTraits": {
        "frostSensitivity": "high",
        "coldTolerance": "low",
        "heatTolerance": "medium",
        "humidityTolerance": "medium",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun",
        "waterNeeds": "medium",
        "floweringRequirements": "Flowers best with strong sun, warmth, and protection from frost and wind.",
        "fruitingRequirements": "Reliable fruiting needs warmth, deep watering, and low frost risk.",
        "survivalVsThriveNotes": "Can survive mild warm climates, but fruiting and overall vigor drop quickly with frost, wind stress, or bad drainage.",
        "warningFlags": [
          "thorny"
        ],
        "groupIds": [
          "warm-citrus-fruit-tree"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "fruitingRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "fruitingRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "warningFlags": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "warm-citrus-fruit-tree"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "rosemary": {
      "slug": "rosemary",
      "name": "Rosemary",
      "scientific": "Salvia rosmarinus",
      "aliases": [
        "rosemary",
        "salvia rosmarinus",
        "rosmarinus officinalis",
        "רוזמרין"
      ],
      "climateTraits": {
        "frostSensitivity": "low",
        "coldTolerance": "medium",
        "heatTolerance": "medium",
        "humidityTolerance": "low",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun",
        "waterNeeds": "low",
        "floweringRequirements": "Best flowering comes with strong sun, airflow, and good drainage.",
        "survivalVsThriveNotes": "Can survive in pots or protected sites more broadly, but truly thrives in sunny, airy, drier climates.",
        "hardBlockRules": [
          "humid-heat-stress"
        ],
        "groupIds": [
          "humid-sensitive-mediterranean"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "hardBlockRules": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "humid-sensitive-mediterranean"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "pomegranate": {
      "slug": "pomegranate",
      "name": "Pomegranate Tree",
      "scientific": "Punica granatum",
      "aliases": [
        "pomegranate",
        "pomegranate tree",
        "punica granatum",
        "רימון",
        "עץ רימון",
        "רימונים"
      ],
      "climateTraits": {
        "frostSensitivity": "medium",
        "coldTolerance": "medium",
        "heatTolerance": "high",
        "humidityTolerance": "medium",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun",
        "waterNeeds": "medium",
        "floweringRequirements": "Best flowering comes with full sun, airflow, and a clear dry-season rhythm.",
        "fruitingRequirements": "Reliable fruiting prefers warm dry seasons, deep but not constant watering, and good drainage.",
        "survivalVsThriveNotes": "Often adaptable in warm climates, but fruit quality is strongest where summers stay sunny and relatively dry.",
        "needsDrySeason": true,
        "groupIds": [
          "warm-dry-mediterranean-fruit"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "fruitingRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION",
          "needsDrySeason": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "fruitingRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "needsDrySeason": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "warm-dry-mediterranean-fruit"
            }
          ]
        }
      }
    },
    "olive": {
      "slug": "olive",
      "name": "Olive Tree",
      "scientific": "Olea europaea",
      "aliases": [
        "olive",
        "olive tree",
        "olea europaea",
        "זית",
        "עץ זית"
      ],
      "climateTraits": {
        "frostSensitivity": "medium",
        "coldTolerance": "medium",
        "heatTolerance": "high",
        "humidityTolerance": "medium",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun",
        "waterNeeds": "low",
        "floweringRequirements": "Flowers best with full sun, good airflow, and a clear seasonal rhythm.",
        "survivalVsThriveNotes": "Often survives warm climates, but thrives and fruits best in dry-summer Mediterranean-style conditions.",
        "fruitingRequirements": "Reliable fruiting prefers dry warm seasons, drainage, and mild winter cueing without severe freeze.",
        "needsDrySeason": true,
        "groupIds": [
          "humid-sensitive-mediterranean"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION",
          "fruitingRequirements": "HEURISTIC_ASSERTION",
          "needsDrySeason": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "fruitingRequirements": "LEGACY_ASSERTED_METADATA",
          "needsDrySeason": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "humid-sensitive-mediterranean"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "hydrangea": {
      "slug": "hydrangea",
      "name": "Hydrangea",
      "scientific": "Hydrangea macrophylla",
      "aliases": [
        "hydrangea",
        "hydrangea macrophylla",
        "הידרנגאה",
        "הורטנזיה"
      ],
      "climateTraits": {
        "frostSensitivity": "low",
        "coldTolerance": "medium",
        "heatTolerance": "low",
        "humidityTolerance": "high",
        "drainageNeeds": "medium",
        "sunNeeds": "morning_sun_part_shade",
        "waterNeeds": "high",
        "floweringRequirements": "Needs moisture, shade protection, and mild conditions for strong growth or flowering.",
        "survivalVsThriveNotes": "May survive in warm climates with irrigation, but only thrives where shade and steady moisture reduce heat stress.",
        "warningFlags": [
          "high_water",
          "toxic_pets",
          "toxic_humans"
        ],
        "hardBlockRules": [
          "hot-dry-full-sun",
          "low-water-mismatch"
        ],
        "groupIds": [
          "high-water-shade-plant",
          "pet-child-caution"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "warningFlags": "LEGACY_ASSERTED_METADATA",
          "hardBlockRules": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "high-water-shade-plant"
            },
            {
              "type": "group",
              "id": "pet-child-caution"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "basil": {
      "slug": "basil",
      "name": "Basil",
      "scientific": "Ocimum basilicum",
      "aliases": [
        "basil",
        "ocimum basilicum",
        "בזיליקום",
        "ריחן"
      ],
      "climateTraits": {
        "frostSensitivity": "high",
        "coldTolerance": "low",
        "heatTolerance": "medium",
        "humidityTolerance": "medium",
        "drainageNeeds": "medium",
        "sunNeeds": "full_sun_to_part_shade",
        "waterNeeds": "medium",
        "floweringRequirements": "Warmth and regular moisture keep foliage productive.",
        "survivalVsThriveNotes": "A warm-season plant that declines quickly with cold snaps or sustained chill.",
        "groupIds": [
          "warm-season-tender-herb"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "warm-season-tender-herb"
            }
          ]
        }
      }
    },
    "mango": {
      "slug": "mango",
      "name": "Mango Tree",
      "scientific": "Mangifera indica",
      "aliases": [
        "mango",
        "mango tree",
        "mangifera indica",
        "מנגו",
        "עץ מנגו",
        "mangoes"
      ],
      "climateTraits": {
        "frostSensitivity": "high",
        "coldTolerance": "low",
        "heatTolerance": "high",
        "humidityTolerance": "medium",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun",
        "waterNeeds": "medium",
        "floweringRequirements": "Warmth, sun, and low frost risk are essential; humidity can reduce bloom quality through disease pressure.",
        "fruitingRequirements": "Reliable fruiting needs a long warm season, low frost risk, and good drainage.",
        "survivalVsThriveNotes": "May survive in protected warm sites, but thriving and reliable fruiting are much narrower than a simple warm-climate tag suggests.",
        "hardBlockRules": [
          "no-small-container"
        ],
        "groupIds": [
          "tropical-frost-sensitive-fruit"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "fruitingRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "fruitingRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "hardBlockRules": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "tropical-frost-sensitive-fruit"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "lychee": {
      "slug": "lychee",
      "name": "Lychee Tree",
      "scientific": "Litchi chinensis",
      "aliases": [
        "lychee",
        "lychee tree",
        "litchi",
        "lichi",
        "litchi chinensis",
        "ליצי",
        "ליצ׳י",
        "עץ ליצי",
        "עץ ליצ׳י"
      ],
      "climateTraits": {
        "frostSensitivity": "high",
        "coldTolerance": "low",
        "heatTolerance": "medium",
        "humidityTolerance": "high",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun_to_part_shade",
        "waterNeeds": "high",
        "floweringRequirements": "Needs a subtler seasonal shift than broad tropical heat; dry winds and erratic stress reduce bloom quality.",
        "fruitingRequirements": "Reliable fruiting usually needs a cooler, drier seasonal signal plus consistent moisture and protection from stress.",
        "survivalVsThriveNotes": "Warm frost-free conditions may allow survival, but thriving and reliable fruiting are much narrower than a generic subtropical label suggests.",
        "needsDrySeason": true,
        "hardBlockRules": [
          "needs-cooler-drier-winter-for-fruit",
          "no-small-container"
        ],
        "groupIds": [
          "humid-subtropical-fruit-tree"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "fruitingRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION",
          "needsDrySeason": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "fruitingRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "needsDrySeason": "LEGACY_ASSERTED_METADATA",
          "hardBlockRules": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "humid-subtropical-fruit-tree"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "guava": {
      "slug": "guava",
      "name": "Guava Tree",
      "scientific": "Psidium guajava",
      "aliases": [
        "guava",
        "guava tree",
        "psidium guajava",
        "גויאבה",
        "עץ גויאבה"
      ],
      "climateTraits": {
        "frostSensitivity": "high",
        "coldTolerance": "low",
        "heatTolerance": "high",
        "humidityTolerance": "medium",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun",
        "waterNeeds": "medium",
        "floweringRequirements": "Warmth, sun, and low frost risk are essential for strong growth.",
        "fruitingRequirements": "Reliable fruiting needs a long warm season, low frost risk, and good drainage.",
        "survivalVsThriveNotes": "May survive in protected warm sites, but thriving and reliable fruiting are much narrower than a simple warm-climate tag suggests.",
        "groupIds": [
          "tropical-frost-sensitive-fruit"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "fruitingRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "fruitingRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "tropical-frost-sensitive-fruit"
            }
          ]
        }
      }
    },
    "apricot": {
      "slug": "apricot",
      "name": "Apricot Tree",
      "scientific": "Prunus armeniaca",
      "aliases": [
        "apricot",
        "apricot tree",
        "prunus armeniaca",
        "משמש",
        "עץ משמש"
      ],
      "climateTraits": {
        "frostSensitivity": "low",
        "coldTolerance": "medium",
        "heatTolerance": "medium",
        "humidityTolerance": "medium",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun",
        "waterNeeds": "medium",
        "floweringRequirements": "Needs full sun plus a real cool-season / winter dormancy signal for reliable bloom.",
        "fruitingRequirements": "Reliable fruiting needs winter chill or clear cool-season conditions; always-hot tropical climates are not a confident match.",
        "survivalVsThriveNotes": "May survive as a tree in some warm locations, but reliable flowering and fruiting depend on winter chill / cool-season cueing.",
        "needsWinterChill": true,
        "groupIds": [
          "temperate-chill-fruit-tree"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "fruitingRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION",
          "needsWinterChill": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "fruitingRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "needsWinterChill": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "temperate-chill-fruit-tree"
            }
          ]
        }
      }
    },
    "orange": {
      "slug": "orange",
      "name": "Orange Tree",
      "scientific": "Citrus sinensis",
      "aliases": [
        "orange",
        "orange tree",
        "citrus sinensis",
        "תפוז",
        "עץ תפוז"
      ],
      "climateTraits": {
        "frostSensitivity": "high",
        "coldTolerance": "low",
        "heatTolerance": "medium",
        "humidityTolerance": "medium",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun",
        "waterNeeds": "medium",
        "floweringRequirements": "Flowers best with strong sun, warmth, and protection from frost and wind.",
        "fruitingRequirements": "Reliable fruiting needs warmth, deep watering, and low frost risk.",
        "survivalVsThriveNotes": "Warm climates suit oranges well, but young trees and heavy fruiting still depend on low frost risk and good drainage.",
        "warningFlags": [
          "thorny"
        ],
        "groupIds": [
          "warm-citrus-fruit-tree"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "fruitingRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "fruitingRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "warningFlags": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "warm-citrus-fruit-tree"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "mandarin": {
      "slug": "mandarin",
      "name": "Mandarin / Clementine Tree",
      "scientific": "Citrus reticulata",
      "aliases": [
        "mandarin",
        "clementine",
        "clementine tree",
        "citrus reticulata",
        "קלמנטינה",
        "מנדרינה",
        "עץ קלמנטינה"
      ],
      "climateTraits": {
        "frostSensitivity": "high",
        "coldTolerance": "low",
        "heatTolerance": "medium",
        "humidityTolerance": "medium",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun",
        "waterNeeds": "medium",
        "floweringRequirements": "Flowers best with strong sun, warmth, and protection from frost and wind.",
        "fruitingRequirements": "Reliable fruiting needs warmth, deep watering, and low frost risk.",
        "survivalVsThriveNotes": "Mandarins are somewhat forgiving citrus, but winter cold still reduces canopy quality and reliable fruiting.",
        "warningFlags": [
          "thorny"
        ],
        "groupIds": [
          "warm-citrus-fruit-tree"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "fruitingRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "fruitingRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "warningFlags": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "warm-citrus-fruit-tree"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "date-palm": {
      "slug": "date-palm",
      "name": "Date Palm",
      "scientific": "Phoenix dactylifera",
      "aliases": [
        "date palm",
        "phoenix dactylifera",
        "תמר",
        "דקל תמר"
      ],
      "climateTraits": {
        "frostSensitivity": "medium",
        "coldTolerance": "medium",
        "heatTolerance": "high",
        "humidityTolerance": "low",
        "drainageNeeds": "medium",
        "sunNeeds": "full_sun",
        "waterNeeds": "medium",
        "survivalVsThriveNotes": "A large palm that truly belongs in hot sunny dry climates with generous space.",
        "groupIds": [
          "hot-dry-palm"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "hot-dry-palm"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "queen-palm": {
      "slug": "queen-palm",
      "name": "Queen Palm",
      "scientific": "Syagrus romanzoffiana",
      "aliases": [
        "queen palm",
        "syagrus romanzoffiana",
        "דקל סיאגרוס",
        "סיאגרוס"
      ],
      "climateTraits": {
        "frostSensitivity": "high",
        "coldTolerance": "low",
        "heatTolerance": "high",
        "humidityTolerance": "medium",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun_to_part_shade",
        "waterNeeds": "medium",
        "survivalVsThriveNotes": "Quality varies sharply with climate, nutrition, and exposure, so treat warm-climate performance conservatively.",
        "floweringRequirements": "Warmth and light are usually easy to supply; sustained frost is the main mismatch.",
        "needsReview": true,
        "groupIds": [
          "warm-climate-palm",
          "frost-sensitive-ornamental"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "needsReview": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "needsReview": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "warm-climate-palm"
            },
            {
              "type": "group",
              "id": "frost-sensitive-ornamental"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "cycas": {
      "slug": "cycas",
      "name": "Sago Palm / Cycas",
      "scientific": "Cycas revoluta",
      "aliases": [
        "sago palm",
        "cycas",
        "cycas revoluta",
        "ציקס"
      ],
      "climateTraits": {
        "frostSensitivity": "high",
        "coldTolerance": "low",
        "heatTolerance": "medium",
        "humidityTolerance": "medium",
        "drainageNeeds": "medium",
        "sunNeeds": "full_sun_to_part_shade",
        "waterNeeds": "medium",
        "survivalVsThriveNotes": "This is a slow toxic ornamental that prefers warmth and drainage; hard frost and overwatering are the main risks.",
        "warningFlags": [
          "toxic_pets",
          "toxic_humans"
        ],
        "groupIds": [
          "warm-climate-palm",
          "pet-child-caution"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "warningFlags": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "warm-climate-palm"
            },
            {
              "type": "group",
              "id": "pet-child-caution"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "hibiscus": {
      "slug": "hibiscus",
      "name": "Hibiscus",
      "scientific": "Hibiscus rosa-sinensis",
      "aliases": [
        "hibiscus",
        "hibiscus rosa-sinensis",
        "היביסקוס"
      ],
      "climateTraits": {
        "frostSensitivity": "high",
        "coldTolerance": "low",
        "heatTolerance": "high",
        "humidityTolerance": "medium",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun_to_part_shade",
        "waterNeeds": "medium",
        "floweringRequirements": "Warmth and light are usually easy to supply; sustained frost is the main mismatch.",
        "survivalVsThriveNotes": "Can look strong in warm sheltered climates, but seasonal freeze risk sharply narrows outdoor suitability.",
        "groupIds": [
          "warm-climate-ornamental",
          "frost-sensitive-ornamental"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "warm-climate-ornamental"
            },
            {
              "type": "group",
              "id": "frost-sensitive-ornamental"
            }
          ]
        }
      }
    },
    "strelitzia": {
      "slug": "strelitzia",
      "name": "Bird of Paradise",
      "scientific": "Strelitzia reginae",
      "aliases": [
        "bird of paradise",
        "strelitzia",
        "strelitzia reginae",
        "סטרליציה"
      ],
      "climateTraits": {
        "frostSensitivity": "high",
        "coldTolerance": "low",
        "heatTolerance": "high",
        "humidityTolerance": "medium",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun_to_part_shade",
        "waterNeeds": "medium",
        "floweringRequirements": "Flowers best with warmth, maturity, and good light.",
        "survivalVsThriveNotes": "May persist in mild climates, but thrives only where frost is rare and heat is sufficient for strong foliage and flowering.",
        "warningFlags": [
          "toxic_pets",
          "toxic_humans"
        ],
        "groupIds": [
          "frost-sensitive-ornamental",
          "pet-child-caution"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "warningFlags": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "frost-sensitive-ornamental"
            },
            {
              "type": "group",
              "id": "pet-child-caution"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "monstera": {
      "slug": "monstera",
      "name": "Monstera",
      "scientific": "Monstera deliciosa",
      "aliases": [
        "monstera",
        "monstera deliciosa",
        "מונסטרה"
      ],
      "climateTraits": {
        "frostSensitivity": "high",
        "coldTolerance": "low",
        "heatTolerance": "medium",
        "humidityTolerance": "medium",
        "drainageNeeds": "medium",
        "sunNeeds": "bright_shade",
        "waterNeeds": "medium",
        "survivalVsThriveNotes": "This is better treated as an indoor or deeply sheltered foliage plant outside of very mild climates.",
        "hardBlockRules": [
          "needs-support"
        ],
        "warningFlags": [
          "toxic_pets",
          "toxic_humans"
        ],
        "groupIds": [
          "tropical-shade-houseplant",
          "support-dependent-plant",
          "pet-child-caution"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "hardBlockRules": "LEGACY_ASSERTED_METADATA",
          "warningFlags": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "tropical-shade-houseplant"
            },
            {
              "type": "group",
              "id": "support-dependent-plant"
            },
            {
              "type": "group",
              "id": "pet-child-caution"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "ficus-benjamina": {
      "slug": "ficus-benjamina",
      "name": "Weeping Fig",
      "scientific": "Ficus benjamina",
      "aliases": [
        "ficus benjamina",
        "weeping fig",
        "פיקוס בנימינה"
      ],
      "climateTraits": {
        "frostSensitivity": "high",
        "coldTolerance": "low",
        "heatTolerance": "medium",
        "humidityTolerance": "medium",
        "drainageNeeds": "medium",
        "sunNeeds": "bright_shade",
        "waterNeeds": "medium",
        "survivalVsThriveNotes": "Best treated as an indoor or sheltered foliage plant unless the outdoor climate is very mild and protected.",
        "groupIds": [
          "tropical-shade-houseplant"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "tropical-shade-houseplant"
            }
          ]
        }
      }
    },
    "aloe-vera": {
      "slug": "aloe-vera",
      "name": "Aloe Vera",
      "scientific": "Aloe vera",
      "aliases": [
        "aloe",
        "aloe vera",
        "אלוורה"
      ],
      "climateTraits": {
        "frostSensitivity": "high",
        "coldTolerance": "low",
        "heatTolerance": "high",
        "humidityTolerance": "low",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun_to_part_shade",
        "waterNeeds": "low",
        "survivalVsThriveNotes": "Best in warm dry conditions with sharp drainage; frost and prolonged rain reduce quality quickly.",
        "warningFlags": [
          "toxic_pets",
          "toxic_humans"
        ],
        "groupIds": [
          "dry-succulent-ornamental",
          "pet-child-caution"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "warningFlags": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "dry-succulent-ornamental"
            },
            {
              "type": "group",
              "id": "pet-child-caution"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "cyclamen": {
      "slug": "cyclamen",
      "name": "Cyclamen",
      "scientific": "Cyclamen persicum",
      "aliases": [
        "cyclamen",
        "cyclamen persicum",
        "רקפת"
      ],
      "climateTraits": {
        "frostSensitivity": "low",
        "coldTolerance": "medium",
        "heatTolerance": "low",
        "humidityTolerance": "medium",
        "drainageNeeds": "medium",
        "sunNeeds": "morning_sun_part_shade",
        "waterNeeds": "medium",
        "floweringRequirements": "Cool weather and bright shade suit this group best.",
        "survivalVsThriveNotes": "A cool-season plant that naturally declines in sustained summer heat.",
        "warningFlags": [
          "toxic_pets",
          "toxic_humans"
        ],
        "groupIds": [
          "cool-season-shade",
          "pet-child-caution"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "warningFlags": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "cool-season-shade"
            },
            {
              "type": "group",
              "id": "pet-child-caution"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "black-eyed-susan-vine": {
      "slug": "black-eyed-susan-vine",
      "name": "Black-eyed Susan Vine",
      "scientific": "Thunbergia alata",
      "aliases": [
        "black eyed susan vine",
        "thunbergia alata",
        "black-eyed susan",
        "סוזן שחורת העין"
      ],
      "climateTraits": {
        "frostSensitivity": "medium",
        "coldTolerance": "low",
        "heatTolerance": "medium",
        "humidityTolerance": "medium",
        "drainageNeeds": "medium",
        "sunNeeds": "full_sun_to_part_shade",
        "waterNeeds": "medium",
        "floweringRequirements": "Best in bright warm conditions with decent drainage.",
        "survivalVsThriveNotes": "Needs a fence, wall, pole, trellis, or similar support instead of open-lawn placement.",
        "hardBlockRules": [
          "needs-support"
        ],
        "groupIds": [
          "warm-climate-ornamental",
          "support-dependent-plant"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "hardBlockRules": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "warm-climate-ornamental"
            },
            {
              "type": "group",
              "id": "support-dependent-plant"
            }
          ]
        }
      }
    },
    "raspberry": {
      "slug": "raspberry",
      "name": "Raspberry",
      "scientific": "Rubus idaeus",
      "aliases": [
        "raspberry",
        "raspberries",
        "rubus idaeus",
        "פטל",
        "שיח פטל",
        "פטל אדום",
        "red raspberry"
      ],
      "climateTraits": {
        "frostSensitivity": "low",
        "coldTolerance": "medium",
        "heatTolerance": "low",
        "humidityTolerance": "medium",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun_to_part_shade",
        "waterNeeds": "high",
        "floweringRequirements": "Cooler roots, steady moisture, and moderate heat improve flowering and fruit quality.",
        "fruitingRequirements": "Reliable fruit quality drops quickly in sustained heat or drought.",
        "survivalVsThriveNotes": "Reliable berry quality depends on support, moisture, and relief from the hottest exposed conditions.",
        "hardBlockRules": [
          "needs-support"
        ],
        "groupIds": [
          "cool-moist-berry",
          "support-dependent-plant"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "fruitingRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "fruitingRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "hardBlockRules": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "cool-moist-berry"
            },
            {
              "type": "group",
              "id": "support-dependent-plant"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "avocado": {
      "slug": "avocado",
      "name": "Avocado Tree",
      "scientific": "Persea americana",
      "aliases": [
        "avocado",
        "avocado tree",
        "persea americana",
        "אבוקדו",
        "עץ אבוקדו"
      ],
      "climateTraits": {
        "frostSensitivity": "high",
        "coldTolerance": "low",
        "heatTolerance": "high",
        "humidityTolerance": "medium",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun",
        "waterNeeds": "medium",
        "floweringRequirements": "Warmth, sun, and low frost risk are essential for strong growth.",
        "fruitingRequirements": "Reliable fruiting needs a long warm season, low frost risk, and good drainage.",
        "survivalVsThriveNotes": "Young trees are especially sensitive to cold, wind, root stress, and bad drainage, so survival is broader than reliable fruiting.",
        "groupIds": [
          "tropical-frost-sensitive-fruit"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "fruitingRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "fruitingRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "tropical-frost-sensitive-fruit"
            },
            {
              "type": "specific",
              "id": "SMART_REC_SPECIFIC_CLIMATE_METADATA"
            }
          ]
        }
      }
    },
    "strawberry-guava": {
      "slug": "strawberry-guava",
      "name": "Strawberry Guava",
      "scientific": "Psidium cattleyanum",
      "aliases": [
        "strawberry guava",
        "psidium cattleyanum",
        "psidium cattleianum",
        "cherry guava",
        "גויאבה תותית"
      ],
      "climateTraits": {
        "frostSensitivity": "high",
        "coldTolerance": "low",
        "heatTolerance": "high",
        "humidityTolerance": "medium",
        "drainageNeeds": "high",
        "sunNeeds": "full_sun",
        "waterNeeds": "medium",
        "floweringRequirements": "Warmth, sun, and low frost risk are essential for strong growth.",
        "fruitingRequirements": "Reliable fruiting needs a long warm season, low frost risk, and good drainage.",
        "survivalVsThriveNotes": "May survive in protected warm sites, but thriving and reliable fruiting are much narrower than a simple warm-climate tag suggests.",
        "needsReview": true,
        "warningFlags": [
          "regional_review"
        ],
        "groupIds": [
          "tropical-frost-sensitive-fruit",
          "invasive-caution"
        ],
        "traitEvidenceClasses": {
          "frostSensitivity": "HEURISTIC_ASSERTION",
          "coldTolerance": "HEURISTIC_ASSERTION",
          "heatTolerance": "HEURISTIC_ASSERTION",
          "humidityTolerance": "HEURISTIC_ASSERTION",
          "drainageNeeds": "HEURISTIC_ASSERTION",
          "sunNeeds": "HEURISTIC_ASSERTION",
          "waterNeeds": "HEURISTIC_ASSERTION",
          "floweringRequirements": "HEURISTIC_ASSERTION",
          "fruitingRequirements": "HEURISTIC_ASSERTION",
          "survivalVsThriveNotes": "HEURISTIC_ASSERTION",
          "needsReview": "HEURISTIC_ASSERTION"
        },
        "fieldOrigins": {
          "frostSensitivity": "LEGACY_ASSERTED_METADATA",
          "coldTolerance": "LEGACY_ASSERTED_METADATA",
          "heatTolerance": "LEGACY_ASSERTED_METADATA",
          "humidityTolerance": "LEGACY_ASSERTED_METADATA",
          "drainageNeeds": "LEGACY_ASSERTED_METADATA",
          "sunNeeds": "LEGACY_ASSERTED_METADATA",
          "waterNeeds": "LEGACY_ASSERTED_METADATA",
          "floweringRequirements": "LEGACY_ASSERTED_METADATA",
          "fruitingRequirements": "LEGACY_ASSERTED_METADATA",
          "survivalVsThriveNotes": "LEGACY_ASSERTED_METADATA",
          "needsReview": "LEGACY_ASSERTED_METADATA",
          "warningFlags": "LEGACY_ASSERTED_METADATA"
        },
        "migration": {
          "version": "1.0.0",
          "kind": "bootstrap-safe-structural-v1",
          "provenance": "LEGACY_ASSERTED_METADATA",
          "sources": [
            {
              "type": "group",
              "id": "tropical-frost-sensitive-fruit"
            },
            {
              "type": "group",
              "id": "invasive-caution"
            }
          ]
        }
      }
    }
  }
};
export default BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1;
