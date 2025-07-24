import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { FlairPlatform } from './platform';
import { RemoteSensor, Client } from 'flair-api-ts';

export class FlairRemoteSensorPlatformAccessory {
  private temperatureService: Service;
  private humidityService: Service;
  private batteryService?: Service;

  constructor(
    private readonly platform: FlairPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly client: Client,
  ) {
    const remoteSensor = this.accessory.context.device as RemoteSensor;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Flair')
      .setCharacteristic(this.platform.Characteristic.Model, 'Remote Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, remoteSensor.id || 'Unknown');

    // Temperature service
    this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) || 
                             this.accessory.addService(this.platform.Service.TemperatureSensor);

    this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, 
      `${remoteSensor.name || 'Remote Sensor'} Temperature`);

    this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));

    // Humidity service
    this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor) || 
                          this.accessory.addService(this.platform.Service.HumiditySensor);

    this.humidityService.setCharacteristic(this.platform.Characteristic.Name, 
      `${remoteSensor.name || 'Remote Sensor'} Humidity`);

    this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(this.handleCurrentRelativeHumidityGet.bind(this));

    // Battery service if battery level is available
    if (remoteSensor['battery-voltage'] !== undefined || remoteSensor['battery-level'] !== undefined) {
      this.batteryService = this.accessory.getService(this.platform.Service.Battery) || 
                           this.accessory.addService(this.platform.Service.Battery);

      this.batteryService.getCharacteristic(this.platform.Characteristic.BatteryLevel)
        .onGet(this.handleBatteryLevelGet.bind(this));

      this.batteryService.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
        .onGet(this.handleStatusLowBatteryGet.bind(this));
    }
  }

  async handleCurrentTemperatureGet(): Promise<CharacteristicValue> {
    const remoteSensor = this.accessory.context.device as RemoteSensor;
    return remoteSensor['current-temperature-c'] || 20;
  }

  async handleCurrentRelativeHumidityGet(): Promise<CharacteristicValue> {
    const remoteSensor = this.accessory.context.device as RemoteSensor;
    return remoteSensor['current-humidity'] || 50;
  }

  async handleBatteryLevelGet(): Promise<CharacteristicValue> {
    const remoteSensor = this.accessory.context.device as RemoteSensor;
    
    if (remoteSensor['battery-level'] !== undefined) {
      return remoteSensor['battery-level'];
    }
    
    // Estimate battery level from voltage if available
    if (remoteSensor['battery-voltage'] !== undefined) {
      // Rough estimation: 3.3V = 100%, 2.7V = 0%
      const voltage = remoteSensor['battery-voltage'];
      const percentage = Math.max(0, Math.min(100, ((voltage - 2.7) / (3.3 - 2.7)) * 100));
      return Math.round(percentage);
    }
    
    return 100; // Default to full if unknown
  }

  async handleStatusLowBatteryGet(): Promise<CharacteristicValue> {
    const remoteSensor = this.accessory.context.device as RemoteSensor;
    
    if (remoteSensor['battery-level'] !== undefined) {
      return remoteSensor['battery-level'] < 20 ? 
        this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW :
        this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    
    if (remoteSensor['battery-voltage'] !== undefined) {
      return remoteSensor['battery-voltage'] < 2.8 ? 
        this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW :
        this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    
    return this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
  }
}