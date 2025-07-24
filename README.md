# homebridge-flair
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

[Flair Smart Home](https://flair.co/) plug-in for [Homebridge](https://github.com/nfarina/homebridge) using the Flair API. Supports the complete Flair ecosystem including smart vents, pucks, HVAC units, thermostats, bridges, and remote sensors.


# Installation

1. Install homebridge using: `npm install -g homebridge`
2. Install this plug-in using: `npm install -g homebridge-flair`
3. Update your configuration file. See example `config.json` snippet below.

## Requirements

- **Node.js**: ^18.17.0 || ^20.0.0 || ^22.0.0
- **Homebridge**: ^1.6.0 || ^2.0.0-beta.0
- **flair-api-ts**: ^2.0.0 (OAuth 2.0 support required)

## Breaking Changes from Previous Versions

- **Authentication**: Username/password authentication has been removed. OAuth 2.0 client credentials are now required.
- **API**: Updated to use flair-api-ts v2.0.0 with modernized API patterns.
- **Configuration**: Remove `username` and `password` from your config - only `clientId` and `clientSecret` are needed.

# Configuration

Configuration sample (edit `~/.homebridge/config.json`):

```json
{
    "platforms": [
        {
            "clientId": "your_client_id",
            "clientSecret": "your_client_secret",
            "pollInterval": 60,
            "platform": "Flair",
            "ventAccessoryType": "windowCovering",
            "hidePuckSensors": true,
            "hidePuckRooms": false,
            "hidePrimaryStructure": true,
            "hideVentTemperatureSensors": false,
            "hideHvacUnits": false,
            "hideThermostats": true,
            "hideBridges": true,
            "hideRemoteSensors": false
        }
    ]
}
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `clientId` | string | **required** | OAuth 2.0 Client ID from Flair app |
| `clientSecret` | string | **required** | OAuth 2.0 Client Secret from Flair app |
| `pollInterval` | number | 60 | How often to poll the Flair API (in seconds, min: 30, max: 600) |
| `ventAccessoryType` | string | "windowCovering" | How vents appear in HomeKit: "windowCovering", "fan", "airPurifier", or "hidden" |
| `hidePuckSensors` | boolean | true | Hide individual puck temperature/humidity sensors |
| `hidePuckRooms` | boolean | false | Hide room thermostats (puck rooms) |
| `hidePrimaryStructure` | boolean | true | Hide the primary structure thermostat |
| `hideVentTemperatureSensors` | boolean | false | Hide vent temperature sensors |
| `hideHvacUnits` | boolean | false | Hide HVAC units (mini-splits) |
| `hideThermostats` | boolean | true | Hide physical thermostats |
| `hideBridges` | boolean | true | Hide Flair communication bridges |
| `hideRemoteSensors` | boolean | false | Hide remote temperature/humidity sensors |

# Obtaining Credentials

This plugin uses **OAuth 2.0 authentication only**. Username/password authentication is no longer supported.

To get your OAuth 2.0 credentials:

1. Open the Flair mobile app
2. Go to **Account Settings**
3. Find **OAuth 2.0 Client Credentials**
4. Copy your Client ID and Client Secret

For business use or if you need help, contact partners@flair.co.

More [API docs and details](https://flair.co/api)

# Supported Devices

This plugin supports the complete Flair smart home ecosystem:

- **Smart Vents** - Control airflow with adjustable dampers
- **Pucks** - Room sensors with temperature, humidity, and pressure readings
- **Room Thermostats** - Virtual thermostats based on puck data
- **HVAC Units** - Mini-split and other HVAC system integration
- **Physical Thermostats** - Traditional wall thermostats
- **Communication Bridges** - Flair system communication hubs
- **Remote Sensors** - Additional temperature and humidity sensors
- **Primary Structure** - Whole-home thermostat control

# Auto Vs Manual Mode

When you use Pucks with your setup the pucks will appear in the app as a Thermostat. 

~~If you turn those thermostats off it will put the Flair system into Manual mode. If you turn the thermostat to any other setting it will set your system to Flair's Auto mode.~~ As of Version 1.3.0 homekit does not do any switching from Auto to Manual mode. This must be done through the flair app, the Puck thermostats now respect the "off" setting.

# Vent Accessory Type

You can specify how vent accessories are shown in HomeKit with the `ventAccessoryType` property.

`windowCovering` - Window Covering
`fan` - Fan
`airPurifier` - Air Purifier
`hidden` - Hidden, this is useful if you have a puck in each room and want to only expose the room "thermostats"


### Commit format

Commits should be formatted as `type(scope): message`

The following types are allowed:

| Type | Description |
|---|---|
| feat | A new feature |
| fix | A bug fix |
| docs | Documentation only changes |
| style | Changes that do not affect the meaning of the code (white-space, formatting,missing semi-colons, etc) |
| refactor | A code change that neither fixes a bug nor adds a feature |
| perf | A code change that improves performance |
| test | Adding missing or correcting existing tests |
| chore | Changes to the build process or auxiliary tools and libraries such as documentation generation |

### Releasing

A new version is released when a merge or push to `main` occurs.

We use the rules at [default-release-rules.js](https://github.com/semantic-release/commit-analyzer/blob/master/lib/default-release-rules.js) as our guide to when a series of commits should create a release.
