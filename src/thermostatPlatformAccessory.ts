import { Service, PlatformAccessory } from 'homebridge';
import { FlairPlatform } from './platform';
import { Thermostat, Client } from 'flair-api-ts';

export class FlairThermostatPlatformAccessory {
  private service: Service;

  constructor(
    private readonly platform: FlairPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly client: Client,
  ) {
    const thermostat = this.accessory.context.device as Thermostat;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Flair')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .setCharacteristic(this.platform.Characteristic.Model, (thermostat as any).make || 'Thermostat')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, thermostat.id || 'Unknown');

    // Use AccessoryInformation service for basic display
    this.service = this.accessory.getService(this.platform.Service.AccessoryInformation)!;
    
    // Set name
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Name, thermostat.name || 'Physical Thermostat');

    this.platform.log.info('Physical Thermostat configured:', thermostat.name || 'Unknown');
  }
}