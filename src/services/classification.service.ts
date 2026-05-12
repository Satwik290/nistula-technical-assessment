export class ClassificationService {
  public classifyBaseline(message: string): { type: string, confidence: number } {
    const msg = message.toLowerCase();
    
    if (msg.includes('broken') || msg.includes('unacceptable') || msg.includes('refund') || msg.includes('no hot water')) {
      return { type: 'complaint', confidence: 0.5 };
    }
    if (msg.includes('available') || msg.includes('dates') || msg.includes('getaway')) {
      return { type: 'pre_sales_availability', confidence: 0.4 };
    }
    if (msg.includes('rate') || msg.includes('price') || msg.includes('cost') || msg.includes('how much')) {
      return { type: 'pre_sales_pricing', confidence: 0.4 };
    }
    if (msg.includes('check in') || msg.includes('wifi') || msg.includes('password')) {
      return { type: 'post_sales_checkin', confidence: 0.4 };
    }
    if (msg.includes('early') || msg.includes('transfer') || msg.includes('airport')) {
      return { type: 'special_request', confidence: 0.3 };
    }
    if (msg.includes('pets') || msg.includes('parking') || msg.includes('packages')) {
      return { type: 'general_enquiry', confidence: 0.3 };
    }
    
    return { type: 'general_enquiry', confidence: 0.1 };
  }
}

export const classificationService = new ClassificationService();
