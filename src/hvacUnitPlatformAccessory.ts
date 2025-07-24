import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { FlairPlatform } from './platform';
import { HvacUnit, Client } from 'flair-api-ts';

export class FlairHvacUnitPlatformAccessory {
  private service: Service;

  constructor(
    private readonly platform: FlairPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly client: Client,
  ) {
    const hvacUnit = this.accessory.context.device as HvacUnit;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Flair')
      .setCharacteristic(this.platform.Characteristic.Model, 'HVAC Unit')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, hvacUnit.id || 'Unknown');

    this.service = this.accessory.getService(this.platform.Service.Thermostat) || 
                   this.accessory.addService(this.platform.Service.Thermostat);

    this.service.setCharacteristic(this.platform.Characteristic.Name, hvacUnit.name || 'HVAC Unit');

    // Set up characteristics
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.handleCurrentHeatingCoolingStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.handleTargetHeatingCoolingStateGet.bind(this))
      .onSet(this.handleTargetHeatingCoolingStateSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onGet(this.handleTargetTemperatureGet.bind(this))
      .onSet(this.handleTargetTemperatureSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onGet(this.handleTemperatureDisplayUnitsGet.bind(this));
  }

  async handleCurrentHeatingCoolingStateGet(): Promise<CharacteristicValue> {
    const hvacUnit = this.accessory.context.device as HvacUnit;
    
    if (!hvacUnit.power || hvacUnit.power === 'Off') {
      return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    }

    switch (hvacUnit.mode) {
      case 'Heat':
        return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
      case 'Cool':
        return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
      default:
        return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    }
  }

  async handleTargetHeatingCoolingStateGet(): Promise<CharacteristicValue> {
    const hvacUnit = this.accessory.context.device as HvacUnit;
    
    if (!hvacUnit.power || hvacUnit.power === 'Off') {
      return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    }

    switch (hvacUnit.mode) {
      case 'Heat':
        return this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
      case 'Cool':
        return this.platform.Characteristic.TargetHeatingCoolingState.COOL;
      case 'Auto':
        return this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
      default:
        return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    }
  }

  async handleTargetHeatingCoolingStateSet(value: CharacteristicValue): Promise<void> {
    const hvacUnit = this.accessory.context.device as HvacUnit;
    
    let mode: string;
    let power = 'On';

    switch (value) {
      case this.platform.Characteristic.TargetHeatingCoolingState.OFF:
        power = 'Off';
        mode = hvacUnit.mode || 'Auto';
        break;
      case this.platform.Characteristic.TargetHeatingCoolingState.HEAT:
        mode = 'Heat';
        break;
      case this.platform.Characteristic.TargetHeatingCoolingState.COOL:
        mode = 'Cool';
        break;
      case this.platform.Characteristic.TargetHeatingCoolingState.AUTO:
        mode = 'Auto';
        break;
      default:
        return;
    }

    try {
      const updatedHvac = await this.client.update('hvac-units', hvacUnit.id!, {
        mode: mode,
        power: power,
      });
      
      this.accessory.context.device = updatedHvac;
      this.platform.log.debug('Updated HVAC unit mode:', mode, 'power:', power);
    } catch (error) {
      this.platform.log.error('Failed to update HVAC unit mode:', error);
      throw error;
    }
  }

  async handleCurrentTemperatureGet(): Promise<CharacteristicValue> {
    const hvacUnit = this.accessory.context.device as HvacUnit;
    return hvacUnit['current-temperature'] || 20;
  }

  async handleTargetTemperatureGet(): Promise<CharacteristicValue> {
    const hvacUnit = this.accessory.context.device as HvacUnit;
    return hvacUnit.temperature || 22;
  }

  async handleTargetTemperatureSet(value: CharacteristicValue): Promise<void> {
    const hvacUnit = this.accessory.context.device as HvacUnit;
    
    try {
      const updatedHvac = await this.client.update('hvac-units', hvacUnit.id!, {
        temperature: value as number,
      });
      
      this.accessory.context.device = updatedHvac;
      this.platform.log.debug('Updated HVAC unit temperature:', value);
    } catch (error) {
      this.platform.log.error('Failed to update HVAC unit temperature:', error);
      throw error;
    }
  }

  async handleTemperatureDisplayUnitsGet(): Promise<CharacteristicValue> {
    return this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;
  }
}