import jsPDF from 'jspdf';

interface OrderData {
  order_number: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  shipping_address?: string;
  price: number;
  payment_status?: string;
  status?: string;
  created_at?: string;
  notes?: string;
  products?: { name: string } | null;
  services?: { name: string } | null;
  shipping_methods?: { name: string; price: number } | null;
}

export const generateInvoicePDF = (order: OrderData, openInNewTab: boolean = true): string => {
  const doc = new jsPDF();
  
  // Colors
  const primaryColor: [number, number, number] = [59, 130, 246];
  const textColor: [number, number, number] = [51, 51, 51];
  const lightGray: [number, number, number] = [245, 245, 245];
  const white: [number, number, number] = [255, 255, 255];

  // Header background
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 45, 'F');

  // Company name / Invoice title
  doc.setTextColor(...white);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', 20, 25);

  // Order number
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`#${order.order_number}`, 20, 35);

  // Date on the right
  const invoiceDate = order.created_at 
    ? new Date(order.created_at).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    : new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
  doc.text(`Date: ${invoiceDate}`, 190, 25, { align: 'right' });

  // Payment status badge
  const paymentStatusText = order.payment_status === 'paid' ? 'PAID' : 
                            order.payment_status === 'awaiting_payment' ? 'PENDING' : 
                            order.payment_status === 'failed' ? 'FAILED' : 'PENDING';
  const statusColor: [number, number, number] = order.payment_status === 'paid' ? [34, 197, 94] : 
                      order.payment_status === 'failed' ? [239, 68, 68] : 
                      [234, 179, 8];
  
  doc.setFillColor(...statusColor);
  doc.roundedRect(150, 30, 40, 10, 2, 2, 'F');
  doc.setFontSize(10);
  doc.text(paymentStatusText, 170, 37, { align: 'center' });

  // Reset text color for body
  doc.setTextColor(...textColor);

  // Bill To section
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO:', 20, 60);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let yPos = 68;
  
  doc.text(order.customer_name, 20, yPos);
  yPos += 6;
  
  if (order.customer_phone) {
    doc.text(`Phone: ${order.customer_phone}`, 20, yPos);
    yPos += 6;
  }
  
  if (order.customer_email) {
    doc.text(`Email: ${order.customer_email}`, 20, yPos);
    yPos += 6;
  }
  
  if (order.shipping_address) {
    const addressLines = doc.splitTextToSize(`Address: ${order.shipping_address}`, 80);
    doc.text(addressLines, 20, yPos);
    yPos += addressLines.length * 5;
  }

  // Order details section on the right
  doc.setFont('helvetica', 'bold');
  doc.text('ORDER DETAILS:', 120, 60);
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Order Number: ${order.order_number}`, 120, 68);
  doc.text(`Status: ${order.status || 'Pending'}`, 120, 74);
  doc.text(`Date: ${invoiceDate}`, 120, 80);

  // Items table - Draw manually
  const tableStartY = 100;
  const rowHeight = 10;
  const colWidths = [80, 25, 40, 40];
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const startX = 20;

  // Table header
  doc.setFillColor(...primaryColor);
  doc.rect(startX, tableStartY, tableWidth, rowHeight, 'F');
  doc.setTextColor(...white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  
  let xOffset = startX + 3;
  doc.text('Description', xOffset, tableStartY + 7);
  xOffset += colWidths[0];
  doc.text('Qty', xOffset + colWidths[1]/2, tableStartY + 7, { align: 'center' });
  xOffset += colWidths[1];
  doc.text('Unit Price', xOffset + colWidths[2]/2, tableStartY + 7, { align: 'center' });
  xOffset += colWidths[2];
  doc.text('Total', xOffset + colWidths[3]/2, tableStartY + 7, { align: 'center' });

  // Table rows
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'normal');
  
  const itemName = order.products?.name || order.services?.name || 'Item';
  const shippingPrice = order.shipping_methods?.price || 0;
  const itemPrice = order.price - shippingPrice;
  
  let currentY = tableStartY + rowHeight;

  // Item row
  doc.setFillColor(...lightGray);
  doc.rect(startX, currentY, tableWidth, rowHeight, 'F');
  
  xOffset = startX + 3;
  doc.text(itemName.substring(0, 35), xOffset, currentY + 7);
  xOffset += colWidths[0];
  doc.text('1', xOffset + colWidths[1]/2, currentY + 7, { align: 'center' });
  xOffset += colWidths[1];
  doc.text(`${itemPrice.toFixed(2)} ILS`, xOffset + colWidths[2]/2, currentY + 7, { align: 'center' });
  xOffset += colWidths[2];
  doc.text(`${itemPrice.toFixed(2)} ILS`, xOffset + colWidths[3]/2, currentY + 7, { align: 'center' });
  
  currentY += rowHeight;

  // Shipping row (if applicable)
  if (order.shipping_methods) {
    doc.setFillColor(...white);
    doc.rect(startX, currentY, tableWidth, rowHeight, 'F');
    
    xOffset = startX + 3;
    doc.text(`Shipping: ${order.shipping_methods.name}`, xOffset, currentY + 7);
    xOffset += colWidths[0];
    doc.text('1', xOffset + colWidths[1]/2, currentY + 7, { align: 'center' });
    xOffset += colWidths[1];
    doc.text(`${shippingPrice.toFixed(2)} ILS`, xOffset + colWidths[2]/2, currentY + 7, { align: 'center' });
    xOffset += colWidths[2];
    doc.text(`${shippingPrice.toFixed(2)} ILS`, xOffset + colWidths[3]/2, currentY + 7, { align: 'center' });
    
    currentY += rowHeight;
  }

  // Draw table border
  doc.setDrawColor(200, 200, 200);
  doc.rect(startX, tableStartY, tableWidth, currentY - tableStartY);

  // Totals section
  const totalsY = currentY + 15;
  doc.setFillColor(...lightGray);
  doc.rect(110, totalsY, 80, 35, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', 115, totalsY + 10);
  doc.text(`${itemPrice.toFixed(2)} ILS`, 185, totalsY + 10, { align: 'right' });

  if (order.shipping_methods) {
    doc.text('Shipping:', 115, totalsY + 18);
    doc.text(`${shippingPrice.toFixed(2)} ILS`, 185, totalsY + 18, { align: 'right' });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL:', 115, totalsY + 28);
  doc.setTextColor(...primaryColor);
  doc.text(`${order.price.toFixed(2)} ILS`, 185, totalsY + 28, { align: 'right' });

  // Notes section (if any)
  if (order.notes) {
    doc.setTextColor(...textColor);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Notes:', 20, totalsY + 10);
    doc.setFont('helvetica', 'normal');
    
    const splitNotes = doc.splitTextToSize(order.notes, 80);
    doc.text(splitNotes.slice(0, 4), 20, totalsY + 18);
  }

  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setFillColor(...primaryColor);
  doc.rect(0, pageHeight - 20, 210, 20, 'F');
  
  doc.setTextColor(...white);
  doc.setFontSize(9);
  doc.text('Thank you for your business!', 105, pageHeight - 10, { align: 'center' });

  // Generate blob URL
  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  
  if (openInNewTab) {
    window.open(pdfUrl, '_blank');
  }
  
  return pdfUrl;
};
