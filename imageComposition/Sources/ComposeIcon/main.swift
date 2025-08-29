import CoreGraphics
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers

func perspectiveTransform(image: CGImage, width: Int, height: Int) -> CGImage? {
    // Apply perspective transformation directly to the image
    let ciImage = CIImage(cgImage: image)
    let filter = CIFilter(name: "CIPerspectiveTransform")!
    
    let w = CGFloat(width)
    let h = CGFloat(height)
    
    // From original JS transformation: top gets narrower by 8% on each side
    // CIFilter uses bottom-left origin
    filter.setValue(ciImage, forKey: kCIInputImageKey)
    filter.setValue(CIVector(x: w * 0.08, y: h), forKey: "inputTopLeft")     // Top-left: inset 8%
    filter.setValue(CIVector(x: w * 0.92, y: h), forKey: "inputTopRight")    // Top-right: inset to 92%
    filter.setValue(CIVector(x: 0, y: 0), forKey: "inputBottomLeft")         // Bottom-left: no change
    filter.setValue(CIVector(x: w, y: 0), forKey: "inputBottomRight")        // Bottom-right: no change
    
    guard let outputImage = filter.outputImage else { return nil }
    
    // Create context for the final image
    let context = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )
    
    guard let ctx = context else { return nil }
    
    ctx.clear(CGRect(x: 0, y: 0, width: width, height: height))
    
    let ciContext = CIContext()
    guard let finalCGImage = ciContext.createCGImage(outputImage, from: outputImage.extent) else { return nil }
    
    // Crop to original size if needed
    if finalCGImage.width == width && finalCGImage.height == height {
        return finalCGImage
    } else {
        let sourceRect = CGRect(x: 0, y: 0, width: width, height: height)
        return finalCGImage.cropping(to: sourceRect)
    }
}

func resizeImage(image: CGImage, width: Int, height: Int) -> CGImage? {
    let context = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )
    
    guard let ctx = context else { return nil }
    
    ctx.clear(CGRect(x: 0, y: 0, width: width, height: height))
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    
    return ctx.makeImage()
}

func compositeImages(baseImage: CGImage, overlayImage: CGImage, offsetY: CGFloat) -> CGImage? {
    let width = baseImage.width
    let height = baseImage.height
    
    let context = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )
    
    guard let ctx = context else { return nil }
    
    // Draw base image
    ctx.draw(baseImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    
    // Calculate centered position with offset (matching GraphicsMagick's gravity('Center').geometry('+0-offset'))
    let overlayWidth = overlayImage.width
    let overlayHeight = overlayImage.height
    
    // Center horizontally and vertically, then apply upward offset
    // CoreGraphics uses bottom-left origin, so we need to flip Y coordinate
    let x = CGFloat(width - overlayWidth) / 2.0
    let centerY = CGFloat(height - overlayHeight) / 2.0
    let y = centerY + offsetY  // In CoreGraphics, positive Y moves up from bottom-left origin
    
    
    // Draw overlay image
    ctx.draw(overlayImage, in: CGRect(x: x, y: y, width: CGFloat(overlayWidth), height: CGFloat(overlayHeight)))
    
    return ctx.makeImage()
}

func loadImage(from path: String) -> CGImage? {
    guard let url = URL(string: "file://\(path)"),
          let imageSource = CGImageSourceCreateWithURL(url as CFURL, nil) else {
        return nil
    }
    
    return CGImageSourceCreateImageAtIndex(imageSource, 0, nil)
}

func saveImage(_ image: CGImage, to path: String) -> Bool {
    guard let url = URL(string: "file://\(path)"),
          let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
        return false
    }
    
    CGImageDestinationAddImage(destination, image, nil)
    return CGImageDestinationFinalize(destination)
}

// Main program
guard CommandLine.arguments.count == 4 else {
    print("Usage: compose-icon <app-icon-path> <mount-icon-path> <output-path>")
    exit(1)
}

let appIconPath = CommandLine.arguments[1]
let mountIconPath = CommandLine.arguments[2]
let outputPath = CommandLine.arguments[3]

guard let appImage = loadImage(from: appIconPath),
      let mountImage = loadImage(from: mountIconPath) else {
    print("Error: Could not load input images")
    exit(1)
}

let appIconSize = (width: appImage.width, height: appImage.height)
let mountIconSize = (width: mountImage.width, height: mountImage.height)

// Apply perspective transformation
guard let transformedAppImage = perspectiveTransform(
    image: appImage,
    width: appIconSize.width,
    height: appIconSize.height
) else {
    print("Error: Could not apply perspective transformation")
    exit(1)
}

// Resize app icon to fit inside mount icon (from JS: width / 1.58, height / 1.82)
let resizedWidth = Int(Double(mountIconSize.width) / 1.58)
let resizedHeight = Int(Double(mountIconSize.height) / 1.82)

guard let resizedAppImage = resizeImage(
    image: transformedAppImage,
    width: resizedWidth,
    height: resizedHeight
) else {
    print("Error: Could not resize app image")
    exit(1)
}

// Composite images with offset (from JS: mountIconSize.height * 0.063)
let offsetY = CGFloat(mountIconSize.height) * 0.063

guard let composedImage = compositeImages(
    baseImage: mountImage,
    overlayImage: resizedAppImage,
    offsetY: offsetY
) else {
    print("Error: Could not composite images")
    exit(1)
}

// Save result
guard saveImage(composedImage, to: outputPath) else {
    print("Error: Could not save output image")
    exit(1)
}
