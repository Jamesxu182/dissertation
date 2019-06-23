/* -*- Mode:C++; c-file-style:"gnu"; indent-tabs-mode:nil; -*- */
/*
* This program is free software; you can redistribute it and/or modify
* it under the terms of the GNU General Public License version 2 as
* published by the Free Software Foundation;
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program; if not, write to the Free Software
* Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
*/

#include "ns3/core-module.h"
#include "ns3/point-to-point-module.h"
#include "ns3/network-module.h"
#include "ns3/applications-module.h"
#include "ns3/mobility-module.h"
#include "ns3/csma-module.h"
#include "ns3/internet-module.h"
#include "ns3/yans-wifi-helper.h"
#include "ns3/ssid.h"
#include "ns3/traffic-control-module.h"


#include <sys/types.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <netinet/in.h>
#include <arpa/inet.h>


// Default Network Topology
//
//   Wifi 10.1.3.0
//                 AP
//  *    *    *    *
//  |    |    |    |    10.1.1.0
// n5   n6   n7   n0 -------------- n1   n2   n3   n4
//                   point-to-point  |    |    |    |
//                                   ================
//                                     LAN 10.1.2.0

using namespace ns3;

NS_LOG_COMPONENT_DEFINE ("ThirdScriptExample");

int socket_fd;

int
InitIPCSocket () {
	int socket_fd;

	struct sockaddr_un server_unix_address;
//	struct sockaddr_in server_internet_address;

    if ((socket_fd = socket(AF_UNIX, SOCK_STREAM, 0)) < 0) {
    	NS_LOG_ERROR ("Cannot create a socket.");
        exit (1);
    }

//    if ((socket_fd = socket(AF_INET, SOCK_STREAM, 0)) < 0) {
//    	NS_LOG_ERROR ("Cannot create a socket.");
//        exit (1);
//    }

    server_unix_address.sun_family = AF_UNIX;
    strcpy (server_unix_address.sun_path, "/tmp/ns-3.sock");

//    server_internet_address.sin_addr.s_addr = inet_addr ("127.0.0.1");
//    server_internet_address.sin_family = AF_INET;
//    server_internet_address.sin_port = htons (1234);

    if (connect (socket_fd, (struct sockaddr *) &server_unix_address, sizeof (server_unix_address)) < 0) {
    	NS_LOG_ERROR ("Cannot connect to the given address.");
        exit (1);
    }

    return socket_fd;
}

void
SendToSocket (int socket_fd, std::string msg) {
    send (socket_fd, msg.c_str (), msg.length (), 0);
}

void
EnqueueTrace (Ptr<const Packet> packet) {
	Ipv4Header ipv4Header;
	PppHeader pppHeader;

	Ptr<Packet> copy = packet->Copy ();
	copy->RemoveHeader (pppHeader);
	copy->PeekHeader (ipv4Header);

	NS_LOG_INFO ("Packet Enqueue from: " << ipv4Header.GetSource () <<" Received by: "<< ipv4Header.GetDestination () << " with a size of: " << packet->GetSize () <<" bytes at: " << Simulator::Now ().GetSeconds ());

	std::ostringstream  msg_oss;
	msg_oss << ipv4Header.GetSource () << "\t" << ipv4Header.GetDestination () << "\t" << packet->GetSize ();
	SendToSocket (socket_fd, msg_oss.str());
}

void
DequeueTrace (Ptr<const Packet> packet) {
	Ipv4Header ipv4Header;
	PppHeader pppHeader;

	Ptr<Packet> copy = packet->Copy ();
	copy->RemoveHeader (pppHeader);
	copy->PeekHeader (ipv4Header);

	NS_LOG_INFO ("Packet Dequeue from: " << ipv4Header.GetSource () <<" Received by: "<< ipv4Header.GetDestination () << " with a size of: " << packet->GetSize () <<" bytes at: " << Simulator::Now ().GetSeconds ());
}

int
main (int argc, char *argv[])
{
	bool verbose = true;
	uint32_t nCsma = 1;
	uint32_t nWifi = 3;
	bool tracing = false;

	CommandLine cmd;
	cmd.AddValue ("nCsma", "Number of \"extra\" CSMA nodes/devices", nCsma);
	cmd.AddValue ("nWifi", "Number of wifi STA devices", nWifi);
	cmd.AddValue ("verbose", "Tell echo applications to log if true", verbose);
	cmd.AddValue ("tracing", "Enable pcap tracing", tracing);

	cmd.Parse (argc,argv);

	// The underlying restriction of 18 is due to the grid position
	// allocator's configuration; the grid layout will exceed the
	// bounding box if more than 18 nodes are provided.
	if (nWifi > 18)
	{
		std::cout << "nWifi should be 18 or less; otherwise grid layout exceeds the bounding box" << std::endl;
		return 1;
	}

	if (verbose)
	{
		LogComponentEnable ("ThirdScriptExample", LOG_LEVEL_INFO);
//		LogComponentEnable ("ThreeGppHttpClient", LOG_LEVEL_INFO);
//		LogComponentEnable ("ThreeGppHttpServer", LOG_LEVEL_INFO);
	}

	NodeContainer p2pNodes;
	p2pNodes.Create (2);

	PointToPointHelper pointToPoint;
	pointToPoint.SetDeviceAttribute ("DataRate", StringValue ("5Mbps"));
	pointToPoint.SetChannelAttribute ("Delay", StringValue ("2ms"));

	NetDeviceContainer p2pDevices;
	p2pDevices = pointToPoint.Install (p2pNodes);

	NodeContainer csmaNodes;
	csmaNodes.Add (p2pNodes.Get (1));
	csmaNodes.Create (nCsma);

	CsmaHelper csma;
	csma.SetChannelAttribute ("DataRate", StringValue ("100Mbps"));
	csma.SetChannelAttribute ("Delay", TimeValue (NanoSeconds (6560)));

	NetDeviceContainer csmaDevices;
	csmaDevices = csma.Install (csmaNodes);

	NodeContainer wifiStaNodes;
	wifiStaNodes.Create (nWifi);
	NodeContainer wifiApNode = p2pNodes.Get (0);

	YansWifiChannelHelper channel = YansWifiChannelHelper::Default ();
	YansWifiPhyHelper phy = YansWifiPhyHelper::Default ();
	phy.SetChannel (channel.Create ());

	WifiHelper wifi;
	wifi.SetRemoteStationManager ("ns3::AarfWifiManager");

	WifiMacHelper mac;
	Ssid ssid = Ssid ("ns-3-ssid");
	mac.SetType ("ns3::StaWifiMac",
		"Ssid", SsidValue (ssid),
		"ActiveProbing", BooleanValue (false));

	NetDeviceContainer staDevices;
	staDevices = wifi.Install (phy, mac, wifiStaNodes);

	mac.SetType ("ns3::ApWifiMac",
		"Ssid", SsidValue (ssid));

	NetDeviceContainer apDevices;
	apDevices = wifi.Install (phy, mac, wifiApNode);

	MobilityHelper mobility;

	mobility.SetPositionAllocator ("ns3::GridPositionAllocator",
					  "MinX", DoubleValue (0.0),
					  "MinY", DoubleValue (0.0),
					  "DeltaX", DoubleValue (5.0),
					  "DeltaY", DoubleValue (10.0),
					  "GridWidth", UintegerValue (3),
					  "LayoutType", StringValue ("RowFirst"));

	mobility.SetMobilityModel ("ns3::RandomWalk2dMobilityModel",
				  "Bounds", RectangleValue (Rectangle (-200, 200, -200, 200)));
	mobility.Install (wifiStaNodes);

	mobility.SetMobilityModel ("ns3::ConstantPositionMobilityModel");
	mobility.Install (wifiApNode);

	InternetStackHelper stack;
	stack.Install (csmaNodes);
	stack.Install (wifiApNode);
	stack.Install (wifiStaNodes);

	Ipv4AddressHelper address;

	address.SetBase ("10.1.1.0", "255.255.255.0");
	Ipv4InterfaceContainer p2pInterfaces;
	p2pInterfaces = address.Assign (p2pDevices);

	address.SetBase ("10.1.2.0", "255.255.255.0");
	Ipv4InterfaceContainer csmaInterfaces;
	csmaInterfaces = address.Assign (csmaDevices);

	address.SetBase ("10.1.3.0", "255.255.255.0");
	address.Assign (staDevices);
	address.Assign (apDevices);

	// 3 GPP Http Application
	ThreeGppHttpServerHelper httpServer (csmaInterfaces.GetAddress (nCsma));
	httpServer.SetAttribute ("LocalAddress", AddressValue (csmaInterfaces.GetAddress (nCsma)));
	httpServer.SetAttribute ("LocalPort", UintegerValue (80));

	ApplicationContainer serverApps = httpServer.Install (csmaNodes.Get (nCsma));
	serverApps.Start (Seconds (1.0));
	serverApps.Stop (Seconds (60.0));

	ThreeGppHttpClientHelper httpClient (csmaInterfaces.GetAddress (nCsma));
	httpClient.SetAttribute ("RemoteServerAddress", AddressValue (csmaInterfaces.GetAddress (nCsma)));
	httpClient.SetAttribute ("RemoteServerPort", UintegerValue (80));

	ApplicationContainer clientApps = httpClient.Install (wifiStaNodes.Get (nWifi - 1));
	clientApps.Start (Seconds (2.0));
	clientApps.Stop (Seconds (60.0));

	for (uint32_t i = 0; i < nWifi; i++) {
			ApplicationContainer clientApps = httpClient.Install (wifiStaNodes.Get (i));
			clientApps.Start (Seconds (2.0));
			clientApps.Stop (Seconds (60.0));
	}

	Ipv4GlobalRoutingHelper::PopulateRoutingTables ();

	AsciiTraceHelper asciiTrace;
	Ptr<Queue<Packet>> queue = StaticCast<PointToPointNetDevice> (p2pDevices.Get (0))->GetQueue ();
//	Ptr<OutputStreamWrapper> streamBytesInQueue = asciiTrace.CreateFileStream ("dev.txt");
	queue->TraceConnectWithoutContext ("Enqueue", MakeCallback (&EnqueueTrace));
	queue->TraceConnectWithoutContext ("Dequeue", MakeCallback (&DequeueTrace));

	Simulator::Stop (Seconds (60.0));

	if (tracing == true)
	{
		pointToPoint.EnablePcapAll ("third");
		phy.EnablePcap ("third", apDevices.Get (0));
		csma.EnablePcap ("third", csmaDevices.Get (0), true);
	}

	// IPC socket
	 socket_fd = InitIPCSocket ();

	Simulator::Run ();
	Simulator::Destroy ();
	return 0;
}
