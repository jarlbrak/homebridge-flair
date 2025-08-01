import { APIEvent } from 'homebridge';
import type {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { FlairPuckPlatformAccessory } from './puckPlatformAccessory';
import {FlairVentPlatformAccessory, VentAccessoryType} from './ventPlatformAccessory';
import { FlairRoomPlatformAccessory } from './roomPlatformAccessory';
import { FlairHvacUnitPlatformAccessory } from './hvacUnitPlatformAccessory';
import { FlairThermostatPlatformAccessory } from './thermostatPlatformAccessory';
import { FlairBridgePlatformAccessory } from './bridgePlatformAccessory';
import { FlairRemoteSensorPlatformAccessory } from './remoteSensorPlatformAccessory';
import {
  Puck,
  Vent,
  Room,
  Structure,
  StructureHeatCoolMode,
  Client,
  Model,
  HvacUnit,
  Thermostat,
  Bridge,
  RemoteSensor,
} from 'flair-api-ts';
import { plainToClass } from 'class-transformer';
import { getRandomIntInclusive } from './utils';
import {FlairStructurePlatformAccessory} from './structurePlatformAccessory';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class FlairPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof this.api.hap.Service;
  public readonly Characteristic: typeof this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  private client?: Client;

  public structure?: Structure;

  private rooms: [FlairRoomPlatformAccessory?] = [];

  private primaryStructureAccessory?: FlairStructurePlatformAccessory;

  private _hasValidConfig?: boolean;

  private _hasValidCredentials?: boolean;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    
    this.log.debug('Finished initializing platform:', this.config.name);

    if (!this.validConfig()) {
      return;
    }

    // Initialize authentication strategy
    this.initializeAuthentication();

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on(APIEvent.DID_FINISH_LAUNCHING, async () => {
      if (!this.validConfig()) {
        return;
      }

      if (!(await this.checkCredentials())) {
        return;
      }

      // run the method to discover / register your devices as accessories
      await this.discoverDevices();

      setInterval(async () => {
        await this.getNewStructureReadings();
      }, (this.config.pollInterval + getRandomIntInclusive(1, 20)) * 1000);
    });
  }

  private validConfig(): boolean {
    if (this._hasValidConfig !== undefined) {
      return this._hasValidConfig!;
    }

    this._hasValidConfig = true;

    if (!this.config.clientId) {
      this.log.error('You need to enter a Flair Client Id');
      this._hasValidConfig = false;
    }

    if (!this.config.clientSecret) {
      this.log.error('You need to enter a Flair Client Secret');
      this._hasValidConfig = false;
    }

    return this._hasValidConfig!;
  }

  private async checkCredentials(): Promise<boolean> {
    if (this._hasValidCredentials !== undefined) {
      return this._hasValidCredentials!;
    }

    try {
      await this.client!.get('users');
      this._hasValidCredentials = true;
    } catch (e) {
      this._hasValidCredentials = false;
      this.log.error(
        'Error getting structure readings this is usually incorrect credentials, ensure you entered the right credentials.',
      );
    }
    return this._hasValidCredentials;
  }

  private initializeAuthentication(): void {
    // Use OAuth 2.0 Client Credentials flow as per @jarlbrak/flair-api-ts v2.1.1+
    this.log.info('Using OAuth 2.0 Client Credentials authentication.');
    
    if (!this.config.clientId || !this.config.clientSecret) {
      this.log.error('Missing required OAuth 2.0 credentials.');
      this.log.error('Please provide clientId and clientSecret from the Flair app Account Settings.');
      return;
    }
    
    // Initialize the Flair API client with OAuth 2.0 client credentials
    this.client = new Client(
      this.config.clientId,
      this.config.clientSecret,
    );
    
    this.log.debug('OAuth 2.0 Client initialized successfully.');
  }

  private async getNewStructureReadings() {
    try {
      const structure = await this.client!.get('structures', (await this.getStructure()).id);
      this.updateStructureFromStructureReading(structure);
    } catch (e) {
      this.log.debug(e as string);
    }
  }

  private updateStructureFromStructureReading(structure: Structure) {
    this.structure = structure;
    for (const room of this.rooms) {
      if (room) {
        room.updateFromStructure(this.structure);
      }
    }
    if (this.primaryStructureAccessory) {
      this.primaryStructureAccessory.updateFromStructure(this.structure);
    }
    return this.structure;
  }

  public async setStructureMode(
    heatingCoolingMode: StructureHeatCoolMode,
  ): Promise<Structure> {
    const currentStructure = await this.getStructure();
    const structure = await this.client!.update('structures', currentStructure.id, {
      mode: heatingCoolingMode,
    });

    return this.updateStructureFromStructureReading(structure);
  }

  private async getStructure(): Promise<Structure> {
    if (this.structure) {
      return this.structure!;
    }
    try {
      const structures = await this.client!.get('structures') as Structure[];
      this.structure = structures.find(s => s.structureType === 'Primary') || structures[0];
    } catch (e) {
      throw (
        'There was an error getting your primary flair home from the api: ' +
        (e as Error).message
      );
    }

    if (!this.structure) {
      throw 'The structure is not available, this should not happen.';
    }

    return this.structure!;
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  async configureAccessory(accessory: PlatformAccessory): Promise<void> {
    if (!this.validConfig()) {
      return;
    }

    if (!(await this.checkCredentials())) {
      return;
    }

    if (accessory.context.type === Vent.type && this.config.ventAccessoryType === VentAccessoryType.Hidden) {
      this.log.info('Removing vent accessory from cache since vents are now hidden:', accessory.displayName);
      await this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory,
      ]);
      return;
    }

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
    this.log.info('Restoring accessory from cache:', accessory.displayName);

    if (accessory.context.type === Puck.type) {
      this.log.info('Restoring puck from cache:', accessory.displayName);
      accessory.context.device = plainToClass(Puck, accessory.context.device);
      new FlairPuckPlatformAccessory(this, accessory, this.client!);
    } else if (accessory.context.type === Vent.type) {
      this.log.info('Restoring vent from cache:', accessory.displayName);
      accessory.context.device = plainToClass(Vent, accessory.context.device);
      new FlairVentPlatformAccessory(this, accessory, this.client!);
    } else if (accessory.context.type === Room.type) {
      this.log.info('Restoring room from cache:', accessory.displayName);
      accessory.context.device = plainToClass(Room, accessory.context.device);
      const structure = await this.getStructure();
      this.rooms.push(
        new FlairRoomPlatformAccessory(
          this,
          accessory,
              this.client!,
              structure,
        ),
      );
    } else if (accessory.context.type === Structure.type) {
      this.log.info('Restoring structure from cache:', accessory.displayName);
      accessory.context.device = plainToClass(Structure, accessory.context.device);
      this.primaryStructureAccessory = new FlairStructurePlatformAccessory(this, accessory, this.client!);
    } else if (accessory.context.type === HvacUnit.type) {
      this.log.info('Restoring HVAC unit from cache:', accessory.displayName);
      accessory.context.device = plainToClass(HvacUnit, accessory.context.device);
      new FlairHvacUnitPlatformAccessory(this, accessory, this.client!);
    } else if (accessory.context.type === Thermostat.type) {
      this.log.info('Restoring thermostat from cache:', accessory.displayName);
      accessory.context.device = plainToClass(Thermostat, accessory.context.device);
      new FlairThermostatPlatformAccessory(this, accessory, this.client!);
    } else if (accessory.context.type === Bridge.type) {
      this.log.info('Restoring bridge from cache:', accessory.displayName);
      accessory.context.device = plainToClass(Bridge, accessory.context.device);
      new FlairBridgePlatformAccessory(this, accessory, this.client!);
    } else if (accessory.context.type === RemoteSensor.type) {
      this.log.info('Restoring remote sensor from cache:', accessory.displayName);
      accessory.context.device = plainToClass(RemoteSensor, accessory.context.device);
      new FlairRemoteSensorPlatformAccessory(this, accessory, this.client!);
    }
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices(): Promise<void> {
    let currentUUIDs: string[] = [];

    const promisesToResolve: [Promise<string[]>?] = [];

    if (this.config.ventAccessoryType !== VentAccessoryType.Hidden) {
      promisesToResolve.push(this.addDevices(await this.client!.get('vents') as [Vent]));
    }

    if (!this.config.hidePrimaryStructure) {
      const structures = await this.client!.get('structures') as Structure[];
      const primaryStructure = structures.find(s => s.structureType === 'Primary') || structures[0];
      promisesToResolve.push(this.addDevices([primaryStructure]));
    }

    if (!this.config.hidePuckRooms) {
      promisesToResolve.push(
        this.addDevices(
          (await this.client!.get('rooms') as Room[]).filter((value: Room) => {
            return value.pucksInactive === 'Active';
          }) as [Room],
        ),
      );
    }

    if (!this.config.hidePuckSensors) {
      promisesToResolve.push(this.addDevices(await this.client!.get('pucks') as [Puck]));
    }

    if (!this.config.hideHvacUnits) {
      promisesToResolve.push(this.addDevices(await this.client!.get('hvac-units') as [HvacUnit]));
    }

    if (!this.config.hideThermostats) {
      promisesToResolve.push(this.addDevices(await this.client!.get('thermostats') as [Thermostat]));
    }

    if (!this.config.hideBridges) {
      promisesToResolve.push(this.addDevices(await this.client!.get('bridges') as [Bridge]));
    }

    if (!this.config.hideRemoteSensors) {
      // Use generic CRUD API to get remote sensors
      promisesToResolve.push(this.addDevices(await this.client!.get('remote-sensors') as [RemoteSensor]));
    }

    const uuids : (string[] | undefined)[] = await Promise.all(promisesToResolve);

    currentUUIDs = currentUUIDs.concat(...uuids as string[][]);

    //Loop over the current uuid's and if they don't exist then remove them.
    for (const accessory of this.accessories) {
      if (currentUUIDs.length === 0 || !currentUUIDs.find((uuid) => uuid === accessory.UUID)) {
        await this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
        delete this.accessories[this.accessories.indexOf(accessory, 0)];
        this.log.debug('Removing not found device:', accessory.displayName);
      }
    }
  }

  async addDevices(devices: [Model]): Promise<string[]> {
    const currentUUIDs: string[] = [];

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of devices) {
      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(device.id!);
      currentUUIDs.push(uuid);

      // check that the device has not already been registered by checking the
      // cached devices we stored in the `configureAccessory` method above
      if (!this.accessories.find((accessory) => accessory.UUID === uuid)) {
        // create a new accessory
        const accessory = new this.api.platformAccessory(device.name!, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device;

        // create the accessory handler
        // this is imported from `puckPlatformAccessory.ts`
        if (device instanceof Puck) {
          accessory.context.type = Puck.type;
          new FlairPuckPlatformAccessory(this, accessory, this.client!);
        } else if (device instanceof Vent) {
          accessory.context.type = Vent.type;
          new FlairVentPlatformAccessory(this, accessory, this.client!);
        } else if (device instanceof Room) {
          accessory.context.type = Room.type;
          const structure = await this.getStructure();
          this.rooms.push(
            new FlairRoomPlatformAccessory(
              this,
              accessory,
                this.client!,
                structure,
            ),
          );
        } else if (device instanceof Structure) {
          accessory.context.type = Structure.type;
          this.primaryStructureAccessory = new FlairStructurePlatformAccessory(
            this,
            accessory,
              this.client!,
          );
        } else if (device instanceof HvacUnit) {
          accessory.context.type = HvacUnit.type;
          new FlairHvacUnitPlatformAccessory(this, accessory, this.client!);
        } else if (device instanceof Thermostat) {
          accessory.context.type = Thermostat.type;
          new FlairThermostatPlatformAccessory(this, accessory, this.client!);
        } else if (device instanceof Bridge) {
          accessory.context.type = Bridge.type;
          new FlairBridgePlatformAccessory(this, accessory, this.client!);
        } else if (device instanceof RemoteSensor) {
          accessory.context.type = RemoteSensor.type;
          new FlairRemoteSensorPlatformAccessory(this, accessory, this.client!);
        } else {
          continue;
        }
        this.log.info(
          `Registering new ${accessory.context.type}`,
          device.name!,
        );

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);

        // push into accessory cache
        this.accessories.push(accessory);

        // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
        // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      } else {
        this.log.debug('Discovered accessory already exists:', device.name!);
      }
    }

    return currentUUIDs;
  }
}
