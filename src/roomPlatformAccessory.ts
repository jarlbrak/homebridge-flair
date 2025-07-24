import type {PlatformAccessory, Service, CharacteristicValue} from 'homebridge';

import {FlairPlatform} from './platform';
import {Room, Structure, StructureHeatCoolMode, Client} from 'flair-api-ts';
import {getRandomIntInclusive} from './utils';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class FlairRoomPlatformAccessory {
  private accessoryInformationService: Service;
  private thermostatService: Service;

  private client: Client;
  private room: Room;
  private structure: Structure;


  constructor(
        private readonly platform: FlairPlatform,
        private readonly accessory: PlatformAccessory,
        client: Client,
        structure: Structure,
  ) {
    this.room = this.accessory.context.device;
    this.client = client;
    this.structure = structure;

    // set accessory information
    this.accessoryInformationService = this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Flair')
      .setCharacteristic(this.platform.Characteristic.Model, 'Room')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.room.id!);

    this.thermostatService = this.accessory.getService(this.platform.Service.Thermostat)
            ?? this.accessory.addService(this.platform.Service.Thermostat);
    this.thermostatService.setPrimaryService(true);
    this.thermostatService
      .setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name)
      .setCharacteristic(this.platform.Characteristic.CurrentTemperature, this.room.currentTemperatureC!)
      .setCharacteristic(this.platform.Characteristic.TargetTemperature, this.room.setPointC!)
      .setCharacteristic(
        this.platform.Characteristic.TargetHeatingCoolingState,
                this.getTargetHeatingCoolingStateFromStructureAndRoom(this.structure)!,
      )
      .setCharacteristic(
        this.platform.Characteristic.CurrentHeatingCoolingState,
                this.getCurrentHeatingCoolingStateFromStructureAndRoom(this.structure)!,
      )
      .setCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.room.currentHumidity!);

    this.thermostatService.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onSet(this.setTargetTemperature.bind(this))
      .onGet(this.getTargetTemperature.bind(this));

    this.thermostatService.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onSet(this.setTargetHeatingCoolingState.bind(this));

    setInterval(async () => {
      await this.getNewRoomReadings();
    }, (platform.config.pollInterval + getRandomIntInclusive(1, 20)) * 1000);
    this.getNewRoomReadings();
  }

  async setTargetHeatingCoolingState(value: CharacteristicValue): Promise<void> {
    if (value === this.platform.Characteristic.TargetHeatingCoolingState.OFF) {
      const room = await this.client.update('rooms', this.room.id, {
        away: true,
      });
      this.updateRoomReadingsFromRoom(room);
      this.platform.log.debug('Set Room to away', value);
    } else if (value === this.platform.Characteristic.TargetHeatingCoolingState.COOL) {
      this.setRoomActive();
      const structure = await this.platform.setStructureMode(StructureHeatCoolMode.COOL);
      this.updateFromStructure(structure);
      this.platform.log.debug('Set Structure to Cool', value);
    } else if (value === this.platform.Characteristic.TargetHeatingCoolingState.HEAT) {
      this.setRoomActive();
      const structure = await this.platform.setStructureMode(StructureHeatCoolMode.HEAT);
      this.updateFromStructure(structure);
      this.platform.log.debug('Set Structure to Heat', value);
    } else if (value === this.platform.Characteristic.TargetHeatingCoolingState.AUTO) {
      this.setRoomActive();
      const structure = await this.platform.setStructureMode(StructureHeatCoolMode.AUTO);
      this.updateFromStructure(structure);
      this.platform.log.debug('Set Structure to Auto', value);
    }
  }

  setRoomActive(): void {
    if (this.room.active) {
      return;
    }
    this.client.update('rooms', this.room.id, {
      away: false,
    }).then(() => {
      this.platform.log.debug('Set Room to active');
    });
  }


  async setTargetTemperature(value: CharacteristicValue): Promise<void> {
    const room = await this.client.update('rooms', this.room.id, {
      setPointC: value as number,
    });
    this.updateRoomReadingsFromRoom(room);
    this.platform.log.debug('Set Characteristic Temperature -> ', value);
  }

  async getTargetTemperature(): Promise<CharacteristicValue> {
    const room = await this.getNewRoomReadings();
    return room.setPointC!;
  }


  async getNewRoomReadings(): Promise<Room> {
    try {
      const room = await this.client.get('rooms', this.room.id) as Room;
      this.updateRoomReadingsFromRoom(room);
      return room;
    } catch (e) {
      this.platform.log.debug(e as string);
    }

    return this.room;
  }

  public updateFromStructure(structure: Structure): void {
    this.structure = structure;

    // push the new value to HomeKit
    this.updateRoomReadingsFromRoom(this.room);

    this.platform.log.debug(
      `Pushed updated current structure state for ${this.room.name!} to HomeKit:`,
            this.structure.structureHeatCoolMode!,
    );
  }

  updateRoomReadingsFromRoom(room: Room): void {
    this.accessory.context.device = room;
    this.room = room;

    // push the new value to HomeKit
    this.thermostatService
      .updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.room.currentTemperatureC!)
      .updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.room.setPointC!)
      .updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.room.currentHumidity!)
      .updateCharacteristic(
        this.platform.Characteristic.TargetHeatingCoolingState,
              this.getTargetHeatingCoolingStateFromStructureAndRoom(this.structure)!,
      )
      .updateCharacteristic(
        this.platform.Characteristic.CurrentHeatingCoolingState,
              this.getCurrentHeatingCoolingStateFromStructureAndRoom(this.structure)!,
      );
    this.platform.log.debug(
      `Pushed updated current temperature state for ${this.room.name!} to HomeKit:`,
            this.room.currentTemperatureC!,
    );
  }

  private getCurrentHeatingCoolingStateFromStructureAndRoom(structure: Structure) {
    if (!this.room.active) {
      return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    }

    if (structure.structureHeatCoolMode === StructureHeatCoolMode.COOL) {
      return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
    }

    if (structure.structureHeatCoolMode === StructureHeatCoolMode.HEAT) {
      return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
    }

    if (structure.structureHeatCoolMode === StructureHeatCoolMode.AUTO) {
      //TODO: When the structure api shows the current thermostat mode change this to that.
      // For now active always means cool.
      return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
    }

    return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
  }


  private getTargetHeatingCoolingStateFromStructureAndRoom(structure: Structure) {
    if (!this.room.active) {
      return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    }

    if (structure.structureHeatCoolMode === StructureHeatCoolMode.COOL) {
      return this.platform.Characteristic.TargetHeatingCoolingState.COOL;
    }

    if (structure.structureHeatCoolMode === StructureHeatCoolMode.HEAT) {
      return this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
    }

    if (structure.structureHeatCoolMode === StructureHeatCoolMode.AUTO) {
      return this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
    }

    return this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
  }

}
