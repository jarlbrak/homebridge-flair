import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { FlairPlatform } from './platform';
import { Bridge, Client } from 'flair-api-ts';

export class FlairBridgePlatformAccessory {
  private service: Service;

  constructor(
    private readonly platform: FlairPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly client: Client,
  ) {
    const bridge = this.accessory.context.device as Bridge;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Flair')
      .setCharacteristic(this.platform.Characteristic.Model, 'Communication Bridge')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, bridge.id || 'Unknown');

    // Use ContactSensor service to show online/offline status
    this.service = this.accessory.getService(this.platform.Service.ContactSensor) || 
                   this.accessory.addService(this.platform.Service.ContactSensor);

    this.service.setCharacteristic(this.platform.Characteristic.Name, bridge.name || 'Flair Bridge');

    this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .onGet(this.handleContactSensorStateGet.bind(this));

    this.updateBridgeStatus();
  }

  async handleContactSensorStateGet(): Promise<CharacteristicValue> {
    const bridge = this.accessory.context.device as Bridge;
    
    // ContactSensorState: 0 = contact detected (online), 1 = no contact (offline)
    // Assume online if connected property doesn't exist
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isOnline = (bridge as any).connected !== false;
    return isOnline ? 
      this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED :
      this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
  }

  private async updateBridgeStatus(): Promise<void> {
    try {
      const bridge = this.accessory.context.device as Bridge;
      
      // Log RSSI and other bridge info
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((bridge as any).rssi !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.platform.log.debug(`Bridge ${bridge.name || bridge.id} RSSI: ${(bridge as any).rssi}dBm`);
      }
      
      if (bridge['led-brightness'] !== undefined) {
        this.platform.log.debug(`Bridge ${bridge.name || bridge.id} LED Brightness: ${bridge['led-brightness']}`);
      }
      
    } catch (error) {
      this.platform.log.error('Failed to update bridge status:', error);
    }
  }
}