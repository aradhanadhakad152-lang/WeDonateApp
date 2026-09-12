'use strict';

const {
  formatWhatsAppMessage,
  sendEmergencyWhatsAppAlert,
} = require('../services/whatsappService');

describe('WhatsApp Emergency Notification Service Suite', () => {
  it('should correctly format emergency blood alert message for WhatsApp', () => {
    const message = formatWhatsAppMessage({
      bloodGroup: 'O-',
      patientName: 'John Doe',
      hospitalName: 'City Hospital',
      formattedDistance: '3.2 km',
      requestId: '1234567890',
    });

    expect(message).toContain('🚨 *WE DONATE EMERGENCY BLOOD ALERT* 🚨');
    expect(message).toContain('*O-*');
    expect(message).toContain('*John Doe*');
    expect(message).toContain('*City Hospital*');
    expect(message).toContain('(3.2 km from your location)');
  });

  it('should reject invalid phone numbers for WhatsApp dispatch', async () => {
    const res = await sendEmergencyWhatsAppAlert('invalid-phone', {
      bloodGroup: 'B+',
      hospitalName: 'Test Hospital',
      formattedDistance: '1 km',
    });

    expect(res.sent).toBe(false);
    expect(res.reason).toBe('Invalid phone number format');
  });

  it('should gracefully handle disabled state when WHATSAPP_ENABLED is false', async () => {
    const res = await sendEmergencyWhatsAppAlert('+919876543210', {
      bloodGroup: 'B+',
      hospitalName: 'Test Hospital',
      formattedDistance: '1 km',
    });

    expect(res.sent).toBe(false);
    expect(res.reason).toContain('WHATSAPP_ENABLED=false');
  });
});
