// MIT License

// Copyright (c) 2024 CyberKitty404

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// ดึงค่าที่ใช้บ่อยจาก Script Properties
const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
const SPREADSHEET_ID = SCRIPT_PROPERTIES.getProperty("SPREADSHEET_ID");
const LINE_ACCESS_TOKEN = SCRIPT_PROPERTIES.getProperty("LINE_ACCESS_TOKEN");
const GOOGLE_FOLDER_ID = SCRIPT_PROPERTIES.getProperty("GOOGLE_FOLDER_ID");

function testScriptProperties() {
  const scriptProps = PropertiesService.getScriptProperties();
  Logger.log("SPREADSHEET_ID: " + scriptProps.getProperty("SPREADSHEET_ID"));
  Logger.log("LINE_ACCESS_TOKEN: " + scriptProps.getProperty("LINE_ACCESS_TOKEN"));
  Logger.log("GOOGLE_FOLDER_ID: " + scriptProps.getProperty("GOOGLE_FOLDER_ID"));
}


function doPost(e) {
  const json = JSON.parse(e.postData.contents);
  const event = json.events[0];
  const messageType = event.message.type;
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  // ข้อความที่ผู้ใช้ส่งมา
  const userMessage = messageType === 'text' ? event.message.text : "";

  // โฟลเดอร์หลักใน Google Drive
  // เปิดโฟลเดอร์นั้น จากนั้นดูที่ URL ในเบราว์เซอร์ 
  // ตัวอย่าง URL: https://drive.google.com/drive/folders/1aBcD3FgH_IJkLMNOpQRsTuvWXYz
  const mainFolderId = GOOGLE_FOLDER_ID;
  const mainFolder = DriveApp.getFolderById(mainFolderId);

  // ตรวจสอบสิทธิ์ผู้ใช้
  if (!isUserAuthorized(userId)) {
    replyToUser(replyToken, "คุณยังไม่ได้รับอนุญาตให้ใช้งานระบบนี้ กรุณาติดต่อแอดมิน");
    return ContentService.createTextOutput(JSON.stringify({ status: "unauthorized" }));
  }

  // ตรวจสอบหรือสร้างโฟลเดอร์สำหรับผู้ใช้
  let userFolder;
  const userFolders = mainFolder.getFoldersByName(userId);
  if (userFolders.hasNext()) {
    userFolder = userFolders.next();
    Logger.log(`Found user folder: ${userFolder.getName()} (${userFolder.getId()})`);
  } else {
    userFolder = mainFolder.createFolder(userId); // สร้างโฟลเดอร์ใหม่สำหรับผู้ใช้
    Logger.log(`Created new folder for userId: ${userId}`);
  }

  // ตรวจสอบหรือหลีกเลี่ยงการประมวลผลข้อความซ้ำ
  const processedMessages = PropertiesService.getScriptProperties().getProperty('processedMessages') || "{}";
  const processed = JSON.parse(processedMessages);

  if (processed[event.message.id]) {
    return ContentService.createTextOutput(JSON.stringify({ status: "already_processed" }));
  }
  processed[event.message.id] = new Date().getTime();
  PropertiesService.getScriptProperties().setProperty('processedMessages', JSON.stringify(processed));

  // กรณีที่ผู้ใช้พิมพ์ "ดูไฟล์"
  if (userMessage.toLowerCase() === "ดูไฟล์") {
    try {
      Logger.log(`Fetching files for userId: ${userId}`);
      const fileLinks = getFilesInFolder(userFolder); // เรียกใช้ฟังก์ชันค้นหาไฟล์ในโฟลเดอร์ย่อย

      const replyText = fileLinks.length > 0
        ? `ไฟล์ที่คุณอัปโหลด:\n\n${fileLinks.join('\n')}`
        : "ยังไม่มีไฟล์ที่คุณอัปโหลดในระบบ";

      replyToUser(replyToken, replyText);
    } catch (error) {
      Logger.log(`Error fetching files: ${error.message}`);
      replyToUser(replyToken, `เกิดข้อผิดพลาดในการตรวจสอบไฟล์: ${error.message}`);
    }
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }));
  }

  // ฟังก์ชันจัดการการอัปโหลดไฟล์
  if (messageType === 'text' || messageType === 'image' || messageType === 'video' || messageType === 'file') {
    handleFileUpload(event, userFolder);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: "success" }));
}

// ฟังก์ชันตรวจสอบสิทธิ์
function isUserAuthorized(userId) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Users");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) { // เริ่มที่แถวที่ 1 เพื่อข้าม Header
    if (data[i][0] === userId) {
      return data[i][1] === "approved"; // ตรวจสอบสถานะเป็น "approved"
    }
  }
  return false; // หากไม่พบ userId ใน Sheet
}

// ฟังก์ชันตอบกลับผู้ใช้
function replyToUser(replyToken, text) {
  const replyMessage = {
    replyToken: replyToken,
    messages: [{ type: "text", text: text }]
  };

  const replyUrl = "https://api.line.me/v2/bot/message/reply";
  const replyOptions = {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}` // ใส่ Access Token ของคุณ
    },
    payload: JSON.stringify(replyMessage)
  };

  UrlFetchApp.fetch(replyUrl, replyOptions);
}

// ฟังก์ชันจัดการการอัปโหลดไฟล์
function handleFileUpload(event, userFolder) {
  const messageType = event.message.type;
  const messageId = event.message.id;
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;

  const options = {
    method: 'get',
    headers: {
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}` // ใส่ Access Token ของคุณ
    }
  };

  const response = UrlFetchApp.fetch(url, options);
  const blob = response.getBlob();

  // กำหนดประเภทไฟล์และโฟลเดอร์ย่อย
  let fileName;
  let subFolderName;
  if (messageType === 'image') {
    fileName = `image_${new Date().toISOString()}.jpg`;
    subFolderName = 'Images';
  } else if (messageType === 'video') {
    fileName = `video_${new Date().toISOString()}.mp4`;
    subFolderName = 'Videos';
  } else if (messageType === 'audio') {
    fileName = `audio_${new Date().toISOString()}.m4a`; // ใช้ .m4a สำหรับไฟล์เสียง
    subFolderName = 'Audios';
  } else if (messageType === 'file') {
    fileName = event.message.fileName || `file_${new Date().toISOString()}`;
    subFolderName = 'Files';
  } else if (messageType === 'text') {
    fileName = `text_${new Date().toISOString()}.txt`;
    subFolderName = 'Text';
    blob = Utilities.newBlob(`User ID: ${event.source.userId}\nMessage: ${event.message.text}`);
  } else {
    replyToUser(event.replyToken, "ไม่รองรับประเภทข้อความนี้");
    return;
  }

  // ตรวจสอบหรือสร้างโฟลเดอร์ย่อยสำหรับประเภทไฟล์
  let subFolder;
  const subFolders = userFolder.getFoldersByName(subFolderName);
  if (subFolders.hasNext()) {
    subFolder = subFolders.next();
    Logger.log(`Found subfolder: ${subFolder.getName()} (${subFolder.getId()})`);
  } else {
    subFolder = userFolder.createFolder(subFolderName);
    Logger.log(`Created subfolder: ${subFolder.getName()}`);
  }

  // ตรวจสอบว่าไฟล์ที่ชื่อเดียวกันมีอยู่แล้วหรือไม่
  const existingFiles = subFolder.getFilesByName(fileName);
  if (existingFiles.hasNext()) {
    Logger.log(`File "${fileName}" already exists. Skipping upload.`);
    replyToUser(event.replyToken, `ไฟล์ "${fileName}" มีอยู่ในระบบแล้ว!`);
    return; // ถ้ามีไฟล์ชื่อเดียวกันแล้ว ไม่ต้องอัปโหลดซ้ำ
  }

  // ถ้าไม่มีไฟล์ชื่อเดียวกัน ให้สร้างไฟล์ใหม่ในโฟลเดอร์ย่อย
  const file = subFolder.createFile(blob.setName(fileName));
  Logger.log(`File "${fileName}" uploaded successfully to subfolder "${subFolderName}".`);

  // ส่งข้อความแจ้งเตือนกลับไปยังผู้ใช้
  const fileUrl = file.getUrl();
  replyToUser(event.replyToken, `ไฟล์ของคุณ "${fileName}" ถูกอัปโหลดสำเร็จ! คุณสามารถดูไฟล์ได้ที่นี่: ${fileUrl}`);
}

// ฟังก์ชันค้นหาไฟล์ในโฟลเดอร์ย่อยทั้งหมด
function getFilesInFolder(folder) {
  let fileLinks = [];

  // ดึงไฟล์ในโฟลเดอร์ปัจจุบัน
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    fileLinks.push(`${file.getName()}: ${file.getUrl()}`);
  }

  // ดึงไฟล์ในโฟลเดอร์ย่อย
  const subFolders = folder.getFolders();
  while (subFolders.hasNext()) {
    const subFolder = subFolders.next();
    const subFolderFiles = getFilesInFolder(subFolder); // ค้นหาไฟล์ในโฟลเดอร์ย่อยแบบ recursive
    fileLinks = fileLinks.concat(subFolderFiles);
  }

  return fileLinks;
}

// ล้างข้อความที่เก็บไว้นานเกิน 24 ชั่วโมง
function clearOldMessages() {
  const processedMessages = JSON.parse(PropertiesService.getScriptProperties().getProperty('processedMessages') || "{}");
  const now = new Date().getTime();

  for (const messageId in processedMessages) {
    if (now - processedMessages[messageId] > 24 * 60 * 60 * 1000) { // 24 ชั่วโมง
      delete processedMessages[messageId];
    }
  }

  PropertiesService.getScriptProperties().setProperty('processedMessages', JSON.stringify(processedMessages));
}