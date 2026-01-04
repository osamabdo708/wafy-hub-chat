import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

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

export const generateInvoicePDF = (order: OrderData): void => {
  const doc = new jsPDF();
  
  // Colors
  const primaryColor = [59, 130, 246]; // Blue
  const textColor = [51, 51, 51];
  const lightGray = [245, 245, 245];

  // Header background
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 210, 45, 'F');

  // Company name / Invoice title
  doc.setTextColor(255, 255, 255);
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
  const statusColor = order.payment_status === 'paid' ? [34, 197, 94] : 
                      order.payment_status === 'failed' ? [239, 68, 68] : 
                      [234, 179, 8];
  
  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.roundedRect(150, 30, 40, 10, 2, 2, 'F');
  doc.setFontSize(10);
  doc.text(paymentStatusText, 170, 37, { align: 'center' });

  // Reset text color for body
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);

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
    doc.text(`Address: ${order.shipping_address}`, 20, yPos);
    yPos += 6;
  }

  // Order details section on the right
  doc.setFont('helvetica', 'bold');
  doc.text('ORDER DETAILS:', 120, 60);
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Order Number: ${order.order_number}`, 120, 68);
  doc.text(`Status: ${order.status || 'Pending'}`, 120, 74);
  doc.text(`Date: ${invoiceDate}`, 120, 80);

  // Items table
  const itemName = order.products?.name || order.services?.name || 'Item';
  const shippingPrice = order.shipping_methods?.price || 0;
  const itemPrice = order.price - shippingPrice;

  const tableData = [
    [itemName, '1', `${itemPrice.toFixed(2)} ILS`, `${itemPrice.toFixed(2)} ILS`]
  ];

  if (order.shipping_methods) {
    tableData.push([
      `Shipping: ${order.shipping_methods.name}`,
      '1',
      `${shippingPrice.toFixed(2)} ILS`,
      `${shippingPrice.toFixed(2)} ILS`
    ]);
  }

  doc.autoTable({
    startY: 100,
    head: [['Description', 'Qty', 'Unit Price', 'Total']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      halign: 'center'
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 80 },
      1: { cellWidth: 25 },
      2: { cellWidth: 40 },
      3: { cellWidth: 40 }
    },
    margin: { left: 20, right: 20 }
  });

  // Get final Y position after table
  const finalY = (doc as any).lastAutoTable.finalY + 10;

  // Totals section
  doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
  doc.rect(110, finalY, 80, 35, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', 115, finalY + 10);
  doc.text(`${itemPrice.toFixed(2)} ILS`, 185, finalY + 10, { align: 'right' });

  if (order.shipping_methods) {
    doc.text('Shipping:', 115, finalY + 18);
    doc.text(`${shippingPrice.toFixed(2)} ILS`, 185, finalY + 18, { align: 'right' });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL:', 115, finalY + 28);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(`${order.price.toFixed(2)} ILS`, 185, finalY + 28, { align: 'right' });

  // Notes section (if any)
  if (order.notes) {
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Notes:', 20, finalY + 10);
    doc.setFont('helvetica', 'normal');
    
    // Split long notes into multiple lines
    const splitNotes = doc.splitTextToSize(order.notes, 80);
    doc.text(splitNotes, 20, finalY + 18);
  }

  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, pageHeight - 20, 210, 20, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text('Thank you for your business!', 105, pageHeight - 10, { align: 'center' });

  // Open in new tab
  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, '_blank');
};
